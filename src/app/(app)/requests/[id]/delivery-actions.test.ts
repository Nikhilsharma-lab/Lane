/**
 * #206: action-caused Needs-you items leave Lane when the action happens, after its response. Asking for a
 * review reaches the Reviewer, raising a Concern reaches the Requester, and an edit that resets answers asks
 * again. Email is switched off in tests, so the recording stand-in sends nothing and the delivery log records
 * "would send" for each person's item, once. Real database, mocked Clerk, `after` run by the test.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";

const ORG = "org_delivery_actions";
const [OWNER, DESIGNER, DEVELOPER] = ["delivery_owner", "delivery_designer", "delivery_developer"];
const session = vi.hoisted(() => ({ userId: "delivery_owner", orgId: "org_delivery_actions", orgRole: "org:member" }));
/** Work `after()` scheduled during the action; the test runs it as the response would finish. */
const scheduled = vi.hoisted(() => [] as (() => Promise<unknown> | unknown)[]);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (work: () => unknown) => { scheduled.push(work); } }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async () => {
        const ids = ["delivery_owner", "delivery_designer", "delivery_developer"];
        return { totalCount: ids.length, data: ids.map((userId) => ({ organization: { id: session.orgId }, role: "org:member", publicUserData: { userId, identifier: `${userId}@example.test`, firstName: userId } })) };
      },
      getOrganizationInvitationList: async () => ({ totalCount: 0, data: [] }),
    },
  }),
}));

const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 2, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Delivery actions','delivery-actions')`;
  for (const id of [OWNER, DESIGNER, DEVELOPER]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`;
});
beforeEach(() => { scheduled.length = 0; });
afterAll(async () => {
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id in (${OWNER}, ${DESIGNER}, ${DEVELOPER})`;
  await connection.end();
});

const as = (userId: string) => { session.userId = userId; };
const respond = async () => { for (const work of scheduled.splice(0)) await work(); };
async function freshRequest() {
  const [row] = await connection`insert into requests(org_id,title,description,created_by) values (${ORG},'Checkout problem','People cannot complete checkout',${OWNER}) returning id`;
  return row.id as string;
}
const revisionOf = async (id: string) => (await connection`select agreement_revision from requests where id=${id}`)[0].agreement_revision as number;
const context = async (id: string) => ({ orgId: ORG, requestId: id, expectedRevision: await revisionOf(id), operationId: randomUUID() });
const reviewerId = async (id: string, userId: string) =>
  ((await connection`select reviewers from request_agreements where request_id=${id}`)[0].reviewers as { id: string; nominee: { userId: string } }[]).find((r) => r.nominee.userId === userId)!.id;
const delivered = (id: string) => connection`select user_id, item_key like 'review:%' as review, item_key like 'concern:%' as concern, outcome from delivery_log where request_id=${id} order by sent_at, user_id`;

async function ask(id: string, people: string[]) {
  const { addReviewers } = await import("./reviewer-actions");
  as(OWNER);
  return addReviewers(await context(id), { nominees: people.map((userId) => ({ kind: "member", userId })), note: "" });
}
async function answer(id: string, userId: string, kind: "looks_good" | "concern", reason = "") {
  const { answerReview } = await import("./reviewer-actions");
  as(userId);
  const result = await answerReview(await context(id), { reviewerId: await reviewerId(id, userId), kind, reason });
  as(OWNER);
  return result;
}

it("asking for a review reaches each Reviewer once, after the response", async () => {
  const id = await freshRequest();
  expect(await ask(id, [DESIGNER, DEVELOPER])).toMatchObject({ success: true });
  expect(await delivered(id)).toEqual([]);
  await respond();
  expect(await delivered(id)).toEqual([
    { user_id: DESIGNER, review: true, concern: false, outcome: "would_send" },
    { user_id: DEVELOPER, review: true, concern: false, outcome: "would_send" },
  ]);
  // Another change to the Request sends nothing already sent.
  await answer(id, DESIGNER, "looks_good");
  await respond();
  expect(await delivered(id)).toHaveLength(2);
});

it("raising a Concern reaches the Requester once; Looks good stays inside Lane", async () => {
  const id = await freshRequest();
  await ask(id, [DESIGNER, DEVELOPER]);
  await respond();
  expect(await answer(id, DESIGNER, "looks_good")).toMatchObject({ success: true });
  await respond();
  expect((await delivered(id)).filter((row) => row.user_id === OWNER)).toEqual([]);
  expect(await answer(id, DEVELOPER, "concern", "The empty state is missing")).toMatchObject({ success: true });
  await respond();
  expect((await delivered(id)).filter((row) => row.user_id === OWNER)).toEqual([{ user_id: OWNER, review: false, concern: true, outcome: "would_send" }]);
});

it("an edit that resets answers asks the Reviewers who had answered again", async () => {
  const id = await freshRequest();
  await ask(id, [DESIGNER, DEVELOPER]);
  await respond();
  await answer(id, DESIGNER, "looks_good");
  const { saveRequestEdits } = await import("./edit-actions");
  const { requestEditSnapshot } = await import("@/lib/request-edit");
  const values = (change: Record<string, unknown> = {}) => ({
    title: "Checkout problem", description: "People cannot complete checkout", affectedPeople: "", desiredChange: "", observedEvidence: "",
    uncertainty: "", usefulLink: "", labelKeys: [] as string[], projectId: null, requestType: null, priority: "none",
    expectedImpact: null, reframedProblem: null, extractedSolution: null, ...change,
  });
  as(OWNER);
  expect(await saveRequestEdits(id, { snapshot: requestEditSnapshot(values() as never), changes: values({ desiredChange: "People finish checkout" }) as never }, { orgId: ORG })).toEqual({ success: true });
  await respond();
  const designerItems = (await delivered(id)).filter((row) => row.user_id === DESIGNER);
  expect(designerItems).toHaveLength(2);
  expect((await delivered(id)).filter((row) => row.user_id === DEVELOPER)).toHaveLength(1);
});
