import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  session: { userId: "", orgId: "", orgRole: "org:member" },
  sessions: [] as Array<{ userId: string; orgId: string; orgRole: string }>,
  memberships: [] as Array<{ organization: { id: string }; role: string; publicUserData: { userId: string; firstName: string; lastName: string } }>,
  clerkFailure: false,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => boundary.sessions.shift() ?? boundary.session,
  clerkClient: async () => ({ organizations: { getOrganizationMembershipList: async (params: { organizationId: string; userId?: string[]; query?: string; limit?: number; offset?: number }) => {
    if (boundary.clerkFailure) throw new Error("Clerk unavailable");
    const members = boundary.memberships.filter(item => item.organization.id === params.organizationId
      && (!params.userId || params.userId.includes(item.publicUserData.userId))
      && (!params.query || `${item.publicUserData.firstName} ${item.publicUserData.lastName}`.toLowerCase().includes(params.query.toLowerCase())));
    return { data: members.slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 10)), totalCount: members.length };
  } } }),
}));

const ORG = "org_design_review_actions_a", FOREIGN_ORG = "org_design_review_actions_b";
const INITIATOR = "user_review_initiator", FIRST = "user_review_first", SECOND = "user_review_second";
const ADMIN = "user_review_admin", GUEST = "user_review_guest", FOREIGN = "user_review_foreign", NOT_JOINED = "user_review_not_joined";
const names: Record<string, string> = { [INITIATOR]: "Initiator", [FIRST]: "Reviewer First", [SECOND]: "Reviewer Second", [ADMIN]: "Admin", [GUEST]: "Guest", [FOREIGN]: "Foreign member" };
let connection: ReturnType<typeof postgres>;
let requestId: string;

const api = () => import("./review-actions");
const input = (reviewerIds = [FIRST], expectedVersion = 0) => ({ expectedVersion, designUrl: "https://example.com/design/version-1", question: "Can people understand the delivery date?", reviewerIds });
const actAs = (userId: string, orgRole = "org:member", orgId = ORG) => { boundary.session = { userId, orgId, orgRole }; };
const state = async () => (await connection`select design_review_version as version,design_reviews as reviews,status from requests where id = ${requestId}`)[0];
const deliveries = async () => connection`select user_id,type,actor_id from notifications where request_id = ${requestId} order by created_at,id`;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/lane_test") throw new Error("Review tests require local lane_test");
  connection = postgres(databaseUrl, { max: 4, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Review actions','review-actions-a'),(${FOREIGN_ORG},'Other workspace','review-actions-b')`;
  for (const [id, name] of Object.entries(names)) await connection`insert into profiles (id,full_name,email) values (${id},${name},${id + "@example.test"})`;
});
beforeEach(async () => {
  actAs(INITIATOR);
  boundary.sessions = []; boundary.clerkFailure = false;
  boundary.memberships = [INITIATOR, FIRST, SECOND, ADMIN, GUEST, NOT_JOINED, FOREIGN].map(id => ({
    organization: { id: id === FOREIGN ? FOREIGN_ORG : ORG },
    role: id === GUEST ? "org:guest" : id === ADMIN ? "org:admin" : "org:member",
    publicUserData: { userId: id, firstName: names[id] ?? "Not joined", lastName: "" },
  }));
  requestId = randomUUID();
  await connection`insert into requests (id,org_id,title,description,created_by) values (${requestId},${ORG},'Review action probe','A design feedback request',${INITIATOR})`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG},${FOREIGN_ORG})`;
  await connection`delete from profiles where id in ${connection(Object.keys(names))}`;
  await connection.end();
});

describe("Ask for review authorization and persistence", () => {
  it("lists current onboarded non-guests in this workspace, excluding the requester", async () => {
    const { listDesignReviewers } = await api();
    const result = await listDesignReviewers(requestId, "", { orgId: ORG });
    expect(result).toEqual({ members: [{ id: ADMIN, name: "Admin" }, { id: FIRST, name: "Reviewer First" }, { id: SECOND, name: "Reviewer Second" }] });
    expect(await listDesignReviewers(requestId, "Reviewer Second", { orgId: ORG })).toEqual({ members: [{ id: SECOND, name: "Reviewer Second" }] });
  });

  it.each([FIRST, ADMIN])("saves a real review and notifies selected member %s without changing work status", async reviewer => {
    const { requestDesignReview } = await api();
    const result = await requestDesignReview(requestId, { ...input([reviewer]), requestedBy: { id: FOREIGN, name: "Forged" } }, { orgId: ORG });
    expect(result).toHaveProperty("state.version", 1);
    const saved = await state();
    expect(saved.status).toBe("open");
    expect(saved.reviews).toMatchObject([{ requestedBy: { id: INITIATOR, name: "Initiator" }, reviewers: [{ id: reviewer, name: names[reviewer] }], designUrl: input().designUrl, question: input().question, responses: [], withdrawal: null }]);
    expect(await deliveries()).toEqual([{ user_id: reviewer, type: "review_requested", actor_id: INITIATOR }]);
  });

  it.each([GUEST, FOREIGN, NOT_JOINED, INITIATOR])("rejects ineligible reviewer %s without changing the Request", async reviewer => {
    const { requestDesignReview } = await api();
    expect(await requestDesignReview(requestId, input([reviewer]), { orgId: ORG })).toHaveProperty("error");
    expect(await state()).toMatchObject({ version: 0, reviews: [] });
    expect(await deliveries()).toHaveLength(0);
  });

  it("revalidates a selected member who left after the picker opened", async () => {
    const { listDesignReviewers, requestDesignReview } = await api();
    expect(await listDesignReviewers(requestId, "", { orgId: ORG })).toHaveProperty("members");
    boundary.memberships = boundary.memberships.filter(item => item.publicUserData.userId !== FIRST);
    expect(await requestDesignReview(requestId, input(), { orgId: ORG })).toHaveProperty("error");
    expect(await state()).toMatchObject({ version: 0, reviews: [] });
  });

  it("denies guest actions and foreign Request access, including the member picker", async () => {
    const { listDesignReviewers, requestDesignReview } = await api();
    actAs(GUEST, "org:guest");
    expect(await listDesignReviewers(requestId, "", { orgId: ORG })).toHaveProperty("error");
    expect(await requestDesignReview(requestId, input(), { orgId: ORG })).toHaveProperty("error");
    actAs(FOREIGN, "org:member", FOREIGN_ORG);
    expect(await listDesignReviewers(requestId, "", { orgId: FOREIGN_ORG })).toHaveProperty("error");
    expect(await requestDesignReview(requestId, input(), { orgId: FOREIGN_ORG })).toHaveProperty("error");
    expect(await state()).toMatchObject({ version: 0, reviews: [] });
  });

  it("fails closed on Clerk failure and preserves the saved state", async () => {
    const { requestDesignReview, listDesignReviewers } = await api();
    boundary.clerkFailure = true;
    expect(await listDesignReviewers(requestId, "", { orgId: ORG })).toHaveProperty("error");
    expect(await requestDesignReview(requestId, input(), { orgId: ORG })).toHaveProperty("error");
    expect(await state()).toMatchObject({ version: 0, reviews: [] });
  });

  it("allows only one concurrent ask and one set of notifications", async () => {
    const { requestDesignReview } = await api();
    const results = await Promise.all([requestDesignReview(requestId, input(), { orgId: ORG }), requestDesignReview(requestId, input(), { orgId: ORG })]);
    expect(results.filter(result => "state" in result)).toHaveLength(1);
    expect(results.filter(result => "error" in result)).toHaveLength(1);
    expect((await state()).reviews).toHaveLength(1);
    expect(await deliveries()).toHaveLength(1);
  });

  it("rolls back the review when its notification cannot be saved", async () => {
    const { requestDesignReview } = await api();
    await connection.unsafe(`
      create function public.reject_review_notification_probe() returns trigger language plpgsql as $$
      begin if NEW.org_id = 'org_design_review_actions_a' then raise exception 'Notification probe failure'; end if; return NEW; end; $$;
      create trigger reject_review_notification_probe before insert on public.notifications for each row execute function public.reject_review_notification_probe();
    `);
    try {
      expect(await requestDesignReview(requestId, input(), { orgId: ORG })).toHaveProperty("error");
      expect(await state()).toMatchObject({ version: 0, reviews: [] });
      expect(await deliveries()).toHaveLength(0);
    } finally {
      await connection.unsafe("drop trigger reject_review_notification_probe on public.notifications; drop function public.reject_review_notification_probe()");
    }
  });
});

describe("review responses and withdrawal", () => {
  async function start(reviewers = [FIRST, SECOND]) {
    const { requestDesignReview } = await api();
    const result = await requestDesignReview(requestId, input(reviewers), { orgId: ORG });
    if (!("state" in result)) throw new Error(result.error);
    return result.state.reviews[0];
  }

  it("records only the named person's response and requires a concern for requested changes", async () => {
    const review = await start();
    const { respondToDesignReview } = await api();
    actAs(ADMIN, "org:admin");
    expect(await respondToDesignReview(requestId, { expectedVersion: 1, reviewId: review.id, decision: "looks_good", note: "" }, { orgId: ORG })).toHaveProperty("error");
    actAs(FIRST);
    expect(await respondToDesignReview(requestId, { expectedVersion: 1, reviewId: review.id, decision: "changes_requested", note: " " }, { orgId: ORG })).toHaveProperty("error");
    expect(await respondToDesignReview(requestId, { expectedVersion: 1, reviewId: review.id, decision: "changes_requested", note: "The keyboard focus is missing.", reviewerId: SECOND }, { orgId: ORG })).toHaveProperty("state.version", 2);
    expect((await state()).reviews[0].responses).toMatchObject([{ reviewerId: FIRST, decision: "changes_requested", note: "The keyboard focus is missing." }]);
    expect(await deliveries()).toEqual(expect.arrayContaining([{ user_id: INITIATOR, type: "review_responded", actor_id: FIRST }]));
  });

  it("keeps response corrections as history and rejects stale revisions", async () => {
    const review = await start();
    const { respondToDesignReview } = await api();
    actAs(FIRST);
    expect(await respondToDesignReview(requestId, { expectedVersion: 1, reviewId: review.id, decision: "changes_requested", note: "Focus missing" }, { orgId: ORG })).toHaveProperty("state.version", 2);
    expect(await respondToDesignReview(requestId, { expectedVersion: 1, reviewId: review.id, decision: "looks_good", note: "Fixed" }, { orgId: ORG })).toHaveProperty("error");
    expect(await respondToDesignReview(requestId, { expectedVersion: 2, reviewId: review.id, decision: "looks_good", note: "Fixed" }, { orgId: ORG })).toHaveProperty("state.version", 3);
    expect((await state()).reviews[0].responses.map((response: { decision: string }) => response.decision)).toEqual(["changes_requested", "looks_good"]);
    expect((await state()).status).toBe("open");
  });

  it("does not overwrite concurrent reviewers' responses", async () => {
    const review = await start();
    const { respondToDesignReview } = await api();
    boundary.sessions = [FIRST, SECOND].map(userId => ({ userId, orgId: ORG, orgRole: "org:member" }));
    const results = await Promise.all([FIRST, SECOND].map(() => respondToDesignReview(requestId, { expectedVersion: 1, reviewId: review.id, decision: "looks_good", note: "" }, { orgId: ORG })));
    expect(results.filter(result => "state" in result)).toHaveLength(1);
    expect(results.filter(result => "error" in result)).toHaveLength(1);
    expect((await state()).reviews[0].responses).toHaveLength(1);
    actAs(results[0] && "error" in results[0] ? FIRST : SECOND);
    expect(await respondToDesignReview(requestId, { expectedVersion: 2, reviewId: review.id, decision: "looks_good", note: "" }, { orgId: ORG })).toHaveProperty("state.version", 3);
    expect((await state()).reviews[0].responses).toHaveLength(2);
  });

  it("rejects a reviewer who was removed or downgraded after the ask", async () => {
    const review = await start();
    const { respondToDesignReview } = await api();
    actAs(FIRST);
    boundary.memberships.find(item => item.publicUserData.userId === FIRST)!.role = "org:guest";
    expect(await respondToDesignReview(requestId, { expectedVersion: 1, reviewId: review.id, decision: "looks_good", note: "" }, { orgId: ORG })).toHaveProperty("error");
    expect((await state()).reviews[0].responses).toHaveLength(0);
  });

  it.each([FIRST, INITIATOR, ADMIN])("permits attributed withdrawal by initiator, Request creator or admin: %s", async userId => {
    actAs(FIRST);
    const review = await start([SECOND]);
    const { withdrawDesignReview } = await api();
    actAs(userId, userId === ADMIN ? "org:admin" : "org:member");
    expect(await withdrawDesignReview(requestId, { expectedVersion: 1, reviewId: review.id, reason: "The design reference has changed." }, { orgId: ORG })).toHaveProperty("state.version", 2);
    expect((await state()).reviews[0].withdrawal).toMatchObject({ by: { id: userId }, reason: "The design reference has changed." });
    expect((await state()).status).toBe("open");
  });

  it("denies withdrawal by another reviewer and a downgraded admin", async () => {
    const review = await start();
    const { withdrawDesignReview } = await api();
    actAs(FIRST);
    expect(await withdrawDesignReview(requestId, { expectedVersion: 1, reviewId: review.id, reason: "Skip it" }, { orgId: ORG })).toHaveProperty("error");
    actAs(ADMIN, "org:admin");
    boundary.memberships.find(item => item.publicUserData.userId === ADMIN)!.role = "org:member";
    expect(await withdrawDesignReview(requestId, { expectedVersion: 1, reviewId: review.id, reason: "Skip it" }, { orgId: ORG })).toHaveProperty("error");
    expect((await state()).reviews[0].withdrawal).toBeNull();
  });
});
