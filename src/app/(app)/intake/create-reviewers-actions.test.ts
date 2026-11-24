import { addMembers, setMembers } from "@/test/member-fixtures";
import { requireTestDatabase } from "@/test/test-database";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { WorkspacePermission } from "@/lib/auth-guard";
import { createTriageToken } from "@/lib/triage-token";

const session = vi.hoisted(() => ({ userId: "create_owner", orgId: "org_create_reviewers", role: "member" as WorkspacePermission }));
const users = ["create_owner", "create_design", "create_dev", "create_guest", "create_viewer"];
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ readSession: async () => ({ ...session }) }));

const connection = postgres(requireTestDatabase(process.env.DATABASE_URL).url, { max: 2, prepare: false });
const orgId = "org_create_reviewers";
const [owner, designer, developer, guest, viewer] = users;
/** Everyone's role to start with; a person without a member row has left the workspace. */
const roles = Object.fromEntries(users.map((id) => [id, id === guest ? "guest" : id === viewer ? "viewer" : "member"]));
const member = (userId: string) => ({ kind: "member", userId });
const invite = { kind: "invitation", invitationId: "inv_create", email: "invited@example.test" };
const impact = { kind: "metric" as const, metric: "Signup completion", baseline: null, target: 70, unit: "%", source: "Signup funnel", reviewAfterDays: 30 };
const draft = { title: "Signup loses customers", description: "Customers abandon signup before finishing.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", expectedImpact: impact };
const triage = { classification: "problem" as const, reframedProblem: null, extractedSolution: null };

function reviewedDraft(userId = owner) {
  const token = createTriageToken(draft, triage, { orgId, userId });
  const requestId = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).requestId as string;
  return { token, requestId };
}
async function create(nominees: unknown, userId = owner, role: WorkspacePermission = "member", note = "") {
  const { saveRequest } = await import("./actions");
  session.userId = userId;
  session.role = role;
  const { token, requestId } = reviewedDraft(userId);
  const result = await saveRequest({ token, editedProblemText: null }, { orgId }, nominees === undefined ? undefined : { nominees, note });
  return { result, requestId };
}
const requestExists = async (id: string) => (await connection`select 1 from requests where id=${id}`).length > 0;
async function reviewersOf(id: string) {
  const [row] = await connection`select reviewers from request_agreements where request_id=${id}`;
  return (row?.reviewers ?? []) as { nominee: unknown; addedBy: string; note: string; decision: unknown }[];
}
const notificationsFor = (id: string) =>
  connection`select user_id, type::text, actor_id, detail from notifications where request_id=${id} order by user_id`;

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${orgId},'Create reviewers test','create-reviewers-test')`;
  for (const [i, id] of users.entries())
    await connection`insert into profiles(id,full_name,email,role) values (${id},${id},${id + "@example.test"},${["pm", "designer", "developer", "pm", "pm"][i]})`;
});
beforeEach(async () => {
  vi.stubEnv("TRIAGE_TOKEN_SECRET", "create-reviewers-test-secret".repeat(3));
  await setMembers(orgId, roles);
});
afterEach(() => {
  session.userId = owner;
  session.role = "member";
});
afterAll(() => connection.end());

it("creating a Request with reviewers saves them unanswered and asks each of them", async () => {
  const { result, requestId } = await create([member(designer), member(developer)]);
  expect(result).toMatchObject({ success: true, requestId });
  expect(await reviewersOf(requestId)).toEqual([
    expect.objectContaining({ nominee: member(designer), addedBy: owner, note: "", decision: null }),
    expect.objectContaining({ nominee: member(developer), addedBy: owner, note: "", decision: null }),
  ]);
  expect(await notificationsFor(requestId)).toEqual([
    { user_id: designer, type: "review_requested", actor_id: owner, detail: null },
    { user_id: developer, type: "review_requested", actor_id: owner, detail: null },
  ]);
});

it("the optional question is saved on each reviewer and sent with their notification", async () => {
  const question = "Can we build this with the current API?";
  const { result, requestId } = await create([member(designer), member(developer)], owner, "member", `  ${question} `);
  expect(result).toMatchObject({ success: true, requestId });
  expect((await reviewersOf(requestId)).map((r) => r.note)).toEqual([question, question]);
  expect((await notificationsFor(requestId)).map((n) => n.detail)).toEqual([question, question]);
});

it("a question over 500 characters is rejected and the Request is not created", async () => {
  const { result, requestId } = await create([member(designer)], owner, "member", "x".repeat(501));
  expect(result).toEqual({ success: false, error: { code: "validation", field: "reviewers", message: "Keep the question to 500 characters." } });
  expect(await requestExists(requestId)).toBe(false);
});

it("creating without reviewers works as before, with no reviews and nobody asked", async () => {
  for (const reviewers of [undefined, []] as const) {
    const { result, requestId } = await create(reviewers);
    expect(result).toMatchObject({ success: true, requestId });
    expect(await reviewersOf(requestId)).toEqual([]);
    expect(await notificationsFor(requestId)).toEqual([]);
  }
});

it("an invalid reviewer is rejected and the Request is not created", async () => {
  const many = Array.from({ length: 21 }, (_, i) => `create_many_${i}`);
  await addMembers(orgId, Object.fromEntries(many.map((userId) => [userId, "member"])));
  const cases: [unknown, string][] = [
    [[member(owner)], "You can’t add yourself as a reviewer."],
    [many.map(member), "A Request can have at most 20 reviewers."],
    [[member(designer), member(designer)], "create_design is already a reviewer."],
    [[{ kind: "member" }], "Choose people to review."],
  ];
  for (const [reviewers, message] of cases) {
    const { result, requestId } = await create(reviewers);
    expect(result).toEqual({ success: false, error: { code: "validation", field: "reviewers", message } });
    expect(await requestExists(requestId)).toBe(false);
    expect(await notificationsFor(requestId)).toEqual([]);
  }
});

it("a guest can create a Request but can't add reviewers", async () => {
  const { result, requestId } = await create([member(designer)], guest, "guest");
  expect(result).toMatchObject({ success: false, error: { code: "validation", field: "reviewers" } });
  expect(await requestExists(requestId)).toBe(false);
  expect(await create([], guest, "guest")).toMatchObject({ result: { success: true } });
});

it("only Admins and Members can be Reviewers: Guests, Viewers, email addresses and invitations are refused and nothing is created", async () => {
  await addMembers(orgId, { [developer]: "admin" });
  for (const role of ["member", "admin"] as const)
    for (const reviewers of [[member(guest)], [member(viewer)], [invite], [{ kind: "email", email: "someone@example.test" }], ["someone@example.test"], [member(designer), invite]]) {
      const { result, requestId } = await create(reviewers, owner, role);
      expect(result).toEqual({ success: false, error: { code: "validation", field: "reviewers", message: "Only Admins and Members can be Reviewers." } });
      expect(await requestExists(requestId)).toBe(false);
    }
  const { result, requestId } = await create([member(developer), member(designer)], owner, "admin");
  expect(result).toMatchObject({ success: true });
  expect((await reviewersOf(requestId)).map((r) => r.nominee)).toEqual([member(developer), member(designer)]);
});

it("a retried create does not add the reviewers or notify them twice", async () => {
  const { saveRequest } = await import("./actions");
  const { token, requestId } = reviewedDraft();
  const picks = { nominees: [member(designer)], note: "" };
  const first = await saveRequest({ token, editedProblemText: null }, { orgId }, picks);
  expect(first).toMatchObject({ success: true, requestId });
  expect(await saveRequest({ token, editedProblemText: null }, { orgId }, picks)).toMatchObject({ success: true, requestId });
  expect(await reviewersOf(requestId)).toHaveLength(1);
  expect(await notificationsFor(requestId)).toHaveLength(1);
});
