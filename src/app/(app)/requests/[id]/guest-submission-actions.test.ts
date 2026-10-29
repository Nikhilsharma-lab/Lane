/**
 * #212 (spec #195, item 4): Guest submissions taken on by a Member. A Guest files without a prediction and sees only
 * their own Requests; Members see the waiting submissions; taking one on makes that Member the Requester, who then
 * writes the prediction; the Guest keeps seeing and commenting. Real database, mocked Clerk, roles switched per call.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTriageToken } from "@/lib/triage-token";
import { TEST_DATABASE_PATH } from "@/test/test-database";

const ORG = "org_guest_take_on";
const [GUEST, MEMBER, OTHER, ADMIN, VIEWER] = ["take_on_guest", "take_on_member", "take_on_other", "take_on_admin", "take_on_viewer"];
const ROLES: Record<string, string> = { [GUEST]: "org:guest", [MEMBER]: "org:member", [OTHER]: "org:member", [ADMIN]: "org:admin", [VIEWER]: "org:viewer" };
const session = vi.hoisted(() => ({ userId: "take_on_guest", orgId: "org_guest_take_on", orgRole: "org:guest" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The AI review and its rate limit are outside services: the review always finds a problem.
vi.mock("@/lib/ai/triage", () => ({ triageRequest: async () => ({ ok: true, triage: { classification: "problem", reframedProblem: null, extractedSolution: null } }) }));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: async () => ({ allowed: true }) }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async ({ userId }: { userId?: string[] } = {}) => {
        const people = Object.entries({ take_on_guest: "org:guest", take_on_member: "org:member", take_on_other: "org:member", take_on_admin: "org:admin", take_on_viewer: "org:viewer" })
          .filter(([id]) => !userId || userId.includes(id));
        return { totalCount: people.length, data: people.map(([id, role]) => ({ organization: { id: session.orgId }, role, publicUserData: { userId: id, identifier: `${id}@example.test`, firstName: "Name", lastName: id } })) };
      },
      getOrganizationInvitationList: async () => ({ totalCount: 0, data: [] }),
    },
  }),
}));

const url = new URL(process.env.DATABASE_URL!);
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
const connection = postgres(url.toString(), { max: 2, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Guest take on','guest-take-on')`;
  for (const id of Object.keys(ROLES)) await connection`insert into profiles(id,full_name,email) values (${id},${"Name " + id},${id + "@example.test"})`;
});
beforeEach(() => vi.stubEnv("TRIAGE_TOKEN_SECRET", "guest-take-on-test-secret".repeat(3)));
afterEach(() => as(GUEST));
afterAll(async () => {
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id in ${connection(Object.keys(ROLES))}`;
  await connection.end();
});

function as(userId: string) {
  session.userId = userId;
  session.orgRole = ROLES[userId];
}
const draft = { title: "Export is hard to find", description: "Customers can't find where to export their invoices.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "" };
const prediction = { kind: "no_measurable_impact" as const, reason: "Keeps invoices where people expect them." };

/** Files a Request the way Intake does: the review (runTriage) and then the save, as `userId`. */
async function file(userId: string, extra: Record<string, unknown> = {}) {
  const intake = await import("../../intake/actions");
  as(userId);
  const reviewed = await intake.runTriage({ ...draft, ...extra }, { orgId: ORG });
  if (!reviewed.success) return { reviewed, saved: null };
  const saved = await intake.saveRequest({ token: reviewed.token, editedProblemText: null }, { orgId: ORG });
  return { reviewed, saved };
}

describe("a Guest files without a prediction", () => {
  it("saves the Request as a Guest submission waiting to be taken on, with no prediction", async () => {
    const { saved } = await file(GUEST);
    expect(saved).toMatchObject({ success: true });
    const id = (saved as { requestId: string }).requestId;
    const [row] = await connection`select created_by, guest_submission, taken_on_by, expected_impact, no_measurable_impact_reason, status from requests where id=${id}`;
    expect(row).toEqual({ created_by: GUEST, guest_submission: true, taken_on_by: null, expected_impact: null, no_measurable_impact_reason: null, status: "open" });
  });

  it("drops a prediction a Guest sends anyway, while a Member still has to write one", async () => {
    const { saved } = await file(GUEST, { expectedImpact: prediction });
    const [row] = await connection`select expected_impact, guest_submission from requests where id=${(saved as { requestId: string }).requestId}`;
    expect(row).toEqual({ expected_impact: null, guest_submission: true });
    const member = await file(MEMBER);
    expect(member.reviewed).toMatchObject({ success: false, error: { code: "validation", field: "expectedImpact" } });
    const filed = await file(MEMBER, { expectedImpact: prediction });
    const [memberRow] = await connection`select guest_submission, taken_on_by from requests where id=${(filed.saved as { requestId: string }).requestId}`;
    expect(memberRow).toEqual({ guest_submission: false, taken_on_by: null });
  });
});

/** A waiting Guest submission filed straight into the database, as `file` would save it. */
async function submission(guest = GUEST) {
  const [row] = await connection`insert into requests(org_id,title,description,created_by,guest_submission) values (${ORG},'Guest asks for dark mode','The dashboard is too bright at night.',${guest},true) returning id`;
  return row.id as string;
}
async function listAs(userId: string) {
  const { loadRequestList } = await import("@/lib/data/requests");
  return (await loadRequestList({ userId, orgId: ORG, role: ROLES[userId].slice(4) as "admin" })).rows;
}

describe("who sees Guest submissions", () => {
  it("a Guest sees only their own Requests; Members see every Guest submission waiting to be taken on", async () => {
    const mine = await submission();
    const [members] = await connection`insert into requests(org_id,title,description,created_by) values (${ORG},'Member work','Work a Member filed for the team.',${MEMBER}) returning id`;
    const guestRows = await listAs(GUEST);
    expect(guestRows.map((row) => row.id)).toContain(mine);
    expect(guestRows.map((row) => row.id)).not.toContain(members.id);
    expect(guestRows.every((row) => row.guestSubmission !== null)).toBe(true);
    for (const reader of [MEMBER, ADMIN, VIEWER]) {
      const rows = await listAs(reader);
      expect(rows.find((row) => row.id === mine)).toMatchObject({ guestSubmission: "waiting" });
      expect(rows.find((row) => row.id === members.id)).toMatchObject({ guestSubmission: null });
    }
  });
});

const revisionOf = async (id: string) => (await connection`select agreement_revision from requests where id=${id}`)[0].agreement_revision as number;
const context = async (id: string) => ({ orgId: ORG, requestId: id, expectedRevision: await revisionOf(id), operationId: randomUUID() });
async function takeOn(id: string, userId: string, ctx?: Awaited<ReturnType<typeof context>>) {
  const { takeOnGuestSubmission } = await import("./take-on-actions");
  as(userId);
  return takeOnGuestSubmission(ctx ?? await context(id));
}
async function detailAs(userId: string, id: string) {
  const { loadRequestDetail } = await import("@/lib/data/requests");
  return loadRequestDetail({ userId, orgId: ORG, role: ROLES[userId].slice(4) as "admin" }, id);
}
const comment = (body: string) => { const form = new FormData(); form.set("body", body); return form; };
/** The edit form's values for the submission, with `change` applied. */
const values = (change: Record<string, unknown> = {}) => ({
  title: "Guest asks for dark mode", description: "The dashboard is too bright at night.", affectedPeople: "", desiredChange: "", observedEvidence: "",
  uncertainty: "", usefulLink: "", labelKeys: [] as string[], projectId: null, requestType: null, priority: "none",
  expectedImpact: null, reframedProblem: null, extractedSolution: null, ...change,
});
async function edit(id: string, userId: string, change: Record<string, unknown>) {
  const { saveRequestEdits } = await import("./edit-actions");
  const { requestEditSnapshot } = await import("@/lib/request-edit");
  as(userId);
  return saveRequestEdits(id, { snapshot: requestEditSnapshot(values() as never), changes: values(change) as never }, { orgId: ORG });
}

describe("taking on a Guest submission", () => {
  it("makes the Member its Requester, once", async () => {
    const id = await submission();
    const ctx = await context(id);
    expect(await takeOn(id, MEMBER, ctx)).toEqual({ success: true, revision: ctx.expectedRevision + 1 });
    // A retry of the same operation replays; nobody else can take it on afterwards, and it never moves.
    expect(await takeOn(id, MEMBER, ctx)).toEqual({ success: true, revision: ctx.expectedRevision + 1 });
    expect(await takeOn(id, OTHER)).toEqual({ error: `Name ${MEMBER} already took this on.` });
    expect(await takeOn(id, ADMIN)).toEqual({ error: `Name ${MEMBER} already took this on.` });
    const [row] = await connection`select taken_on_by, taken_on_at is not null as dated, created_by from requests where id=${id}`;
    expect(row).toEqual({ taken_on_by: MEMBER, dated: true, created_by: GUEST });
    const { readRequestOutcome } = await import("./outcome-actions");
    as(OTHER);
    expect(await readRequestOutcome(id, { orgId: ORG })).toMatchObject({ requesterId: MEMBER, requesterName: `Name ${MEMBER}` });
    expect(await detailAs(OTHER, id)).toMatchObject({ request: { guestSubmission: { state: "taken_on", takenOnBy: MEMBER, takenOnByName: `Name ${MEMBER}`, submitterName: `Name ${GUEST}` } } });
  });

  it("is refused to the Guest, a Viewer, and for a Request that isn't a Guest submission", async () => {
    const id = await submission();
    const { VIEWER_REFUSAL } = await import("@/lib/auth-guard");
    expect(await takeOn(id, GUEST)).toEqual({ error: "Only Members and Admins can take on a Guest submission." });
    expect(await takeOn(id, VIEWER)).toEqual({ error: VIEWER_REFUSAL });
    const [members] = await connection`insert into requests(org_id,title,description,created_by) values (${ORG},'Member work','Work a Member filed for the team.',${OTHER}) returning id`;
    expect(await takeOn(members.id, MEMBER)).toEqual({ error: "Only a Guest submission can be taken on." });
    expect((await connection`select taken_on_by from requests where id in (${id}, ${members.id})`).map((row) => row.taken_on_by)).toEqual([null, null]);
    // An Admin may take it on too.
    expect(await takeOn(id, ADMIN)).toMatchObject({ success: true });
  });

  it("asks the new Requester for the prediction before anyone can pick it up", async () => {
    const id = await submission();
    const { pickUpRequest } = await import("./actions");
    as(MEMBER);
    expect(await detailAs(MEMBER, id)).toMatchObject({ request: { guestSubmission: { state: "waiting" }, pickupBlockedReason: "Take this Guest submission on before picking it up." } });
    expect(await pickUpRequest(id, { orgId: ORG })).toEqual({ error: "Take this Guest submission on before picking it up." });
    await takeOn(id, MEMBER);
    expect(await detailAs(MEMBER, id)).toMatchObject({ request: { pickupBlockedReason: "Set the goal before picking up this Request." } });
    as(OTHER);
    expect(await pickUpRequest(id, { orgId: ORG })).toEqual({ error: "Set the goal before picking up this Request." });
    // The Requester writes it; then the work can start.
    expect(await edit(id, MEMBER, { expectedImpact: prediction })).toEqual({ success: true });
    expect(await detailAs(MEMBER, id)).toMatchObject({ request: { noMeasurableImpactReason: prediction.reason, pickupBlockedReason: null } });
    as(OTHER);
    expect(await pickUpRequest(id, { orgId: ORG })).toMatchObject({ success: true });
  });

  it("leaves the Guest seeing and commenting, but no longer editing", async () => {
    const id = await submission();
    // Before it's taken on, the Guest can still change their own words, but never write the prediction.
    expect(await edit(id, GUEST, { expectedImpact: prediction })).toEqual({ error: "A Member sets the goal once they take this on." });
    expect(await edit(id, GUEST, { desiredChange: "A dark theme" })).toEqual({ success: true });
    await takeOn(id, MEMBER);
    expect(await edit(id, GUEST, { title: "Something else" })).toEqual({ error: "Request unavailable." });
    expect(await detailAs(GUEST, id)).toMatchObject({ request: { id, guestSubmission: { state: "taken_on", takenOnByName: `Name ${MEMBER}` } } });
    const { addComment } = await import("./actions");
    as(GUEST);
    expect(await addComment(id, comment("Thanks for taking this on"), { orgId: ORG })).toMatchObject({ success: true });
    // The comment reaches the new Requester.
    const notified = await connection`select user_id from notifications where request_id=${id} and type='comment_added'`;
    expect(notified.map((row) => row.user_id)).toEqual([MEMBER]);
  });
}); void createTriageToken; void prediction;
