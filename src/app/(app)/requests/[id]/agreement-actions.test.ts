import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
const session = vi.hoisted(() => ({
  userId: "agreement_owner",
  orgId: "org_agreement",
  orgRole: "org:member",
}));
const invitationState = vi.hoisted(() => ({
  status: "pending",
  verified: true,
}));
const users = vi.hoisted(() => [
  "agreement_owner",
  "agreement_design",
  "agreement_dev",
  "agreement_other",
  "agreement_guest",
]);
/** Clerk roster roles; a user missing from it has left the workspace. */
const roster = vi.hoisted(() => new Map<string, string>());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async () => ({
        totalCount: roster.size,
        data: [...roster].map(([userId, role]) => ({
          organization: { id: session.orgId },
          role,
          publicUserData: {
            userId,
            identifier: userId + "@example.test",
            firstName: userId,
          },
        })),
      }),
      getOrganizationInvitationList: async () => ({
        totalCount: invitationState.status === "pending" ? 1 : 0,
        data:
          invitationState.status === "pending"
            ? [
                {
                  id: "inv_agreement",
                  organizationId: session.orgId,
                  status: "pending",
                  role: "org:member",
                  emailAddress: "invited@example.test",
                },
              ]
            : [],
      }),
      getOrganizationInvitation: async () => ({
        id: "inv_agreement",
        organizationId: session.orgId,
        status: invitationState.status,
        emailAddress: "invited@example.test",
      }),
    },
    users: {
      getUser: async (userId: string) => ({
        emailAddresses: [
          {
            emailAddress:
              userId === users[3]
                ? "invited@example.test"
                : userId + "@example.test",
            verification: {
              status: invitationState.verified ? "verified" : "unverified",
            },
          },
        ],
      }),
    },
  }),
}));
const connection = postgres(process.env.DATABASE_URL!, {
  max: 6,
  prepare: false,
});
const orgId = "org_agreement";
const [owner, designer, developer, other, guest] = users;
const member = (userId: string) => ({ kind: "member", userId });
const invite = {
  kind: "invitation",
  invitationId: "inv_agreement",
  email: "invited@example.test",
};
const contextFor = (requestId: string, expectedRevision: number) => ({
  orgId,
  requestId,
  expectedRevision,
  operationId: randomUUID(),
});
const as = (userId: string, orgRole = "org:member") => {
  session.userId = userId;
  session.orgRole = orgRole;
};
async function freshRequest() {
  const [row] =
    await connection`insert into requests(org_id,title,description,created_by) values (${orgId},'Checkout problem','People cannot complete checkout',${owner}) returning id`;
  return row.id as string;
}
async function revisionOf(id: string) {
  const [row] = await connection`select agreement_revision from requests where id=${id}`;
  return row.agreement_revision as number;
}
async function reviewersOf(id: string) {
  const [row] = await connection`select reviewers from request_agreements where request_id=${id}`;
  return (row?.reviewers ?? []) as { id: string; nominee: { kind: string; userId?: string }; decision: null | { kind: string; reason: string } }[];
}
async function add(id: string, nominees: unknown[], userId = owner, orgRole = "org:member") {
  const api = await import("./agreement-actions");
  as(userId, orgRole);
  const result = await api.addReviewers(contextFor(id, await revisionOf(id)), { nominees, note: "" });
  as(owner);
  return result;
}
async function answer(id: string, userId: string, kind: "looks_good" | "concern", reason = "") {
  const api = await import("./agreement-actions");
  const reviewer = (await reviewersOf(id)).find((r) => r.nominee.userId === userId || (r.nominee.kind === "invitation" && userId === other));
  as(userId);
  const result = await api.answerReview(contextFor(id, await revisionOf(id)), { reviewerId: reviewer?.id ?? randomUUID(), kind, reason });
  as(owner);
  return result;
}
beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${orgId},'Agreement test','agreement-test')`;
  for (const [i, id] of users.entries())
    await connection`insert into profiles(id,full_name,email,role) values (${id},${"Person " + i},${id + "@example.test"},${["pm", "designer", "developer", "designer", "pm"][i]})`;
});
beforeEach(() => {
  roster.clear();
  for (const id of users) roster.set(id, id === guest ? "org:guest" : "org:member");
});
afterEach(() => {
  as(owner);
  session.orgId = orgId;
  invitationState.status = "pending";
  invitationState.verified = true;
});
afterAll(() => connection.end());

it("a member adds reviewers; everyone sees them with their profile role and no answers yet", async () => {
  const api = await import("./agreement-actions");
  const id = await freshRequest();
  expect(await add(id, [member(designer), member(developer)])).toMatchObject({ success: true, revision: 1 });
  as(other);
  const view = await api.readReviews(id, { orgId });
  expect(view).toMatchObject({
    open: true,
    canAdd: true,
    canInvite: false,
    canRemove: false,
    reviewers: [
      { name: "agreement_design", role: "Designer", active: true, decision: null, canAnswer: false },
      { name: "agreement_dev", role: "Developer", active: true, decision: null, canAnswer: false },
    ],
  });
});

it("guests, the person adding and the requester can't be added; only admins add an invitation", async () => {
  const id = await freshRequest();
  expect(await add(id, [member(guest)], designer)).toEqual({ error: "A selected person is no longer available." });
  expect(await add(id, [member(designer)], designer)).toEqual({ error: "You can’t add yourself as a reviewer." });
  expect(await add(id, [member(owner)], designer)).toEqual({ error: "The requester can’t review their own Request." });
  expect(await add(id, [invite], designer)).toEqual({ error: "Only an admin can invite someone by email." });
  expect(await add(id, [member(developer)], guest, "org:guest")).toHaveProperty("error");
  expect(await reviewersOf(id)).toEqual([]);
  expect(await add(id, [member(developer)], designer)).toMatchObject({ success: true });
  expect(await add(id, [member(developer)], other)).toEqual({ error: "agreement_dev is already a reviewer." });
  expect(await add(id, [invite], other, "org:admin")).toMatchObject({ success: true });
  expect((await reviewersOf(id)).map((r) => r.nominee)).toEqual([member(developer), invite]);
});

it("a Request holds at most twenty reviewers", async () => {
  const id = await freshRequest();
  const many = Array.from({ length: 21 }, (_, i) => `agreement_many_${i}`);
  for (const userId of many) roster.set(userId, "org:member");
  expect(await add(id, many.slice(0, 20).map(member))).toMatchObject({ success: true });
  expect(await add(id, [member(many[20])])).toEqual({ error: "A Request can have at most 20 reviewers." });
  expect(await reviewersOf(id)).toHaveLength(20);
});

it("only the named reviewer answers; a concern needs a reason; they can change their answer", async () => {
  const api = await import("./agreement-actions");
  const id = await freshRequest();
  await add(id, [member(designer), member(developer)]);
  const [first] = await reviewersOf(id);
  as(developer);
  expect(await api.answerReview(contextFor(id, await revisionOf(id)), { reviewerId: first.id, kind: "looks_good", reason: "" })).toEqual({ error: "Only the named reviewer can answer." });
  expect(await answer(id, developer, "concern", " ")).toEqual({ error: "Say what concerns you." });
  expect(await answer(id, developer, "concern", "The API cannot do this yet")).toMatchObject({ success: true });
  expect(await answer(id, designer, "looks_good")).toMatchObject({ success: true });
  expect((await reviewersOf(id)).map((r) => r.decision)).toEqual([
    expect.objectContaining({ kind: "looks_good", reason: "" }),
    expect.objectContaining({ kind: "concern", reason: "The API cannot do this yet" }),
  ]);
  expect(await answer(id, developer, "looks_good")).toMatchObject({ success: true });
  expect(await answer(id, designer, "concern", "Missing the empty state")).toMatchObject({ success: true });
  expect((await reviewersOf(id)).map((r) => r.decision?.kind)).toEqual(["concern", "looks_good"]);
  as(designer);
  expect(await api.readReviews(id, { orgId })).toMatchObject({ reviewers: [{ canAnswer: true }, { canAnswer: false }] });
});

it("an invited person answers once they have accepted and verified their email", async () => {
  const id = await freshRequest();
  await add(id, [invite], other, "org:admin");
  expect(await answer(id, other, "looks_good")).toHaveProperty("error");
  invitationState.status = "accepted";
  invitationState.verified = false;
  expect(await answer(id, other, "looks_good")).toHaveProperty("error");
  invitationState.verified = true;
  expect(await answer(id, other, "looks_good")).toMatchObject({ success: true });
  expect((await reviewersOf(id))[0]).toMatchObject({ nominee: member(other), decision: { kind: "looks_good", actorId: other } });
});

it("the requester or an admin removes a reviewer; nobody else can", async () => {
  const api = await import("./agreement-actions");
  const id = await freshRequest();
  await add(id, [member(designer), member(developer)]);
  const [first, second] = await reviewersOf(id);
  as(designer);
  expect(await api.removeReviewer(contextFor(id, await revisionOf(id)), { reviewerId: second.id })).toEqual({ error: "Only the requester or an admin can remove a reviewer." });
  as(owner);
  expect(await api.removeReviewer(contextFor(id, await revisionOf(id)), { reviewerId: first.id })).toMatchObject({ success: true });
  as(other, "org:admin");
  expect(await api.removeReviewer(contextFor(id, await revisionOf(id)), { reviewerId: second.id })).toMatchObject({ success: true });
  expect(await reviewersOf(id)).toEqual([]);
});

it("a reviewer who left stays listed, greyed out, and a retried answer replays", async () => {
  const api = await import("./agreement-actions");
  const id = await freshRequest();
  await add(id, [member(designer)]);
  const [reviewer] = await reviewersOf(id);
  as(designer);
  const context = contextFor(id, await revisionOf(id));
  const input = { reviewerId: reviewer.id, kind: "looks_good", reason: "" };
  const first = await api.answerReview(context, input);
  expect(first).toMatchObject({ success: true });
  expect(await api.answerReview(context, input)).toEqual(first);
  expect(await api.answerReview(context, { ...input, kind: "concern", reason: "x" })).toHaveProperty("error");
  roster.delete(designer);
  as(owner);
  expect(await api.readReviews(id, { orgId })).toMatchObject({ reviewers: [{ name: "agreement_design", active: false, canAnswer: false }] });
});

it("pickup succeeds with an open concern and an unanswered review; afterwards nothing about reviews changes", async () => {
  const api = await import("./agreement-actions");
  const lifecycle = await import("./actions");
  const id = await freshRequest();
  await add(id, [member(designer), member(developer)]);
  await answer(id, developer, "concern", "The API cannot do this yet");
  as(other);
  expect(await lifecycle.pickUpRequest(id, { orgId })).toEqual({ success: true });
  const [designerReview] = await reviewersOf(id);
  expect(await add(id, [member(other)])).toEqual({ error: "Work has started. Reviews can no longer change." });
  expect(await answer(id, designer, "looks_good")).toEqual({ error: "Work has started. Reviews can no longer change." });
  as(owner);
  expect(await api.removeReviewer(contextFor(id, await revisionOf(id)), { reviewerId: designerReview.id })).toEqual({ error: "Work has started. Reviews can no longer change." });
  expect(await api.readReviews(id, { orgId })).toMatchObject({ open: false, canAdd: false, canRemove: false, reviewers: [{ decision: null, canAnswer: false }, { decision: { kind: "concern" } }] });

  const bulk = await freshRequest();
  await add(bulk, [member(designer)]);
  expect((await lifecycle.pickUpRequests([bulk], { orgId })).moved).toEqual([bulk]);
});

it("the requester or an admin deletes an Open Request with its reviews; nobody deletes started work", async () => {
  const lifecycle = await import("./actions");
  const id = await freshRequest();
  await add(id, [member(designer)]);
  await answer(id, designer, "looks_good");
  await connection`insert into comments(request_id,author_id,body) values (${id},${designer},'Looks good')`;
  as(designer);
  expect(await lifecycle.deleteRequest(id, { orgId })).toHaveProperty("error");
  as(guest, "org:guest");
  expect(await lifecycle.deleteRequest(id, { orgId })).toEqual({ error: "Not found" });
  as(owner);
  expect(await lifecycle.deleteRequest(id, { orgId })).toEqual({ success: true });
  const [left] = await connection`select (select count(*) from requests where id=${id})::int requests, (select count(*) from comments where request_id=${id})::int comments, (select count(*) from request_agreements where request_id=${id})::int agreements, (select count(*) from request_agreement_events where request_id=${id})::int events`;
  expect(left).toEqual({ requests: 0, comments: 0, agreements: 0, events: 0 });

  const byAdmin = await freshRequest();
  as(other, "org:admin");
  expect(await lifecycle.deleteRequest(byAdmin, { orgId })).toEqual({ success: true });

  const started = await freshRequest();
  expect(await lifecycle.pickUpRequest(started, { orgId })).toEqual({ success: true });
  expect(await lifecycle.deleteRequest(started, { orgId })).toHaveProperty("error");
});
