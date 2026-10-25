/**
 * #213 (spec #195, seam 1): the Free Requests block, through the actions people use. Real database, mocked Clerk,
 * roles switched per call. The first 4 Requests are free; once they are used (and there is no paid plan), creating a
 * new Request, a follow-up, or taking on a Guest submission is refused with "an Admin needs to pay", and nothing else
 * is. All of it only while `LANE_BILLING_ENFORCED` is on; with it off no workspace is ever blocked.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";

const ORGS = ["org_fr_block", "org_fr_race", "org_fr_deleted", "org_fr_guests", "org_fr_follow", "org_fr_off"] as const;
type Org = (typeof ORGS)[number];
const [MEMBER, OTHER, GUEST, ADMIN] = ["fr_member", "fr_other", "fr_guest", "fr_admin"];
const ROLES: Record<string, string> = { [MEMBER]: "org:member", [OTHER]: "org:member", [GUEST]: "org:guest", [ADMIN]: "org:admin" };
const session = vi.hoisted(() => ({ userId: "fr_member", orgId: "org_fr_block", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai/triage", () => ({ triageRequest: async () => ({ ok: true, triage: { classification: "problem", reframedProblem: null, extractedSolution: null } }) }));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: async () => ({ allowed: true }) }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async ({ userId }: { userId?: string[] } = {}) => {
        const people = Object.entries({ fr_member: "org:member", fr_other: "org:member", fr_guest: "org:guest", fr_admin: "org:admin" }).filter(([id]) => !userId || userId.includes(id));
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
  const { claimFreeRequests } = await import("@/lib/billing");
  for (const id of Object.keys(ROLES)) await connection`insert into profiles(id,full_name,email) values (${id},${"Name " + id},${id + "@example.test"})`;
  for (const org of ORGS) {
    await connection`insert into organizations(id,name,slug) values (${org},'Free Requests',${org})`;
    // Each workspace's creator works at their own company, so each holds its own 4 Free Requests.
    await claimFreeRequests({ orgId: org }, `founder@${org.replaceAll("_", "-")}.example`);
  }
});
beforeEach(() => {
  vi.stubEnv("TRIAGE_TOKEN_SECRET", "free-requests-test-secret".repeat(3));
  vi.stubEnv("LANE_BILLING_ENFORCED", "1");
});
afterEach(() => vi.unstubAllEnvs());
// A released Request's history can't be deleted, so the follow-up workspace stays until the next reset (as in the
// outcome action tests); the profiles it names stay with it.
afterAll(async () => {
  await connection`delete from organizations where id in ${connection(ORGS.filter((org) => org !== "org_fr_follow"))}`;
  await connection.end();
});

function as(userId: string, orgId: Org) {
  session.userId = userId;
  session.orgId = orgId;
  session.orgRole = ROLES[userId];
}
const draft = { title: "Export is hard to find", description: "Customers can't find where to export their invoices.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "" };
const prediction = { kind: "no_measurable_impact" as const, reason: "Keeps invoices where people expect them." };
const intake = () => import("./actions");

async function review(orgId: Org, userId = MEMBER) {
  as(userId, orgId);
  return (await intake()).runTriage({ ...draft, ...(userId === GUEST ? {} : { expectedImpact: prediction }) }, { orgId });
}
async function save(orgId: Org, token: string, userId = MEMBER) {
  as(userId, orgId);
  return (await intake()).saveRequest({ token, editedProblemText: null }, { orgId });
}
/** Files a Request the way Intake does: the review, then the save. */
async function file(orgId: Org, userId = MEMBER) {
  const reviewed = await review(orgId, userId);
  if (!reviewed.success) return reviewed;
  return save(orgId, reviewed.token, userId);
}
async function fileMany(orgId: Org, count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const saved = await file(orgId);
    if (!("requestId" in saved)) throw Error(`Request ${i + 1} wasn't filed: ${JSON.stringify(saved)}`);
    ids.push(saved.requestId);
  }
  return ids;
}
const requestCount = async (orgId: Org) => (await connection`select count(*)::int as n from requests where org_id=${orgId}`)[0].n as number;
const blocked = (start: string) => ({ success: false, error: { code: "billing_blocked", message: expect.stringMatching(new RegExp(`^${start}.* An Admin needs to pay for Lane`)) } });

describe("the 5th Request", () => {
  it("files the first 4 and refuses the 5th before the AI review, saying an Admin needs to pay", async () => {
    await fileMany("org_fr_block", 4);
    expect(await review("org_fr_block")).toEqual(blocked("This workspace has used its 4 Free Requests\\."));
    expect(await review("org_fr_block", ADMIN)).toEqual(blocked("This workspace has used its 4 Free Requests\\."));
    expect(await requestCount("org_fr_block")).toBe(4);
  });

  it("checks again when saving, and a retried save of a Request already created still succeeds", async () => {
    await fileMany("org_fr_race", 3);
    const [first, second] = [await review("org_fr_race"), await review("org_fr_race", OTHER)];
    if (!first.success || !second.success) throw Error("reviews should pass with one Free Request left");
    const saved = await save("org_fr_race", first.token);
    expect(saved).toMatchObject({ success: true });
    expect(await save("org_fr_race", second.token, OTHER)).toEqual(blocked("This workspace has used its 4 Free Requests\\."));
    expect(await save("org_fr_race", first.token)).toMatchObject({ success: true, requestId: (saved as { requestId: string }).requestId });
    expect(await requestCount("org_fr_race")).toBe(4);
  });

  it("counts a deleted Request, so deleting one gives nothing back", async () => {
    const [id] = await fileMany("org_fr_deleted", 4);
    const { deleteRequest } = await import("../requests/[id]/actions");
    as(MEMBER, "org_fr_deleted");
    expect(await deleteRequest(id, { orgId: "org_fr_deleted" })).toEqual({ success: true });
    expect(await requestCount("org_fr_deleted")).toBe(3);
    expect(await review("org_fr_deleted")).toEqual(blocked("This workspace has used its 4 Free Requests\\."));
  });

  it("blocks nothing else: work already filed keeps moving and taking comments", async () => {
    const [id] = (await connection`select id from requests where org_id='org_fr_block' order by request_number limit 1`).map((row) => row.id as string);
    const actions = await import("../requests/[id]/actions");
    as(OTHER, "org_fr_block");
    expect(await actions.pickUpRequest(id, { orgId: "org_fr_block" })).toMatchObject({ success: true });
    const form = new FormData();
    form.set("body", "Still working on it");
    expect(await actions.addComment(id, form, { orgId: "org_fr_block" })).toMatchObject({ success: true });
    expect(await actions.markDone(id, { orgId: "org_fr_block" })).toMatchObject({ success: true });
  });
});

describe("Guest submissions", () => {
  const takeOn = async (id: string, userId = MEMBER) => {
    const { takeOnGuestSubmission } = await import("../requests/[id]/take-on-actions");
    const [row] = await connection`select agreement_revision from requests where id=${id}`;
    as(userId, "org_fr_guests");
    return takeOnGuestSubmission({ orgId: "org_fr_guests", requestId: id, expectedRevision: row.agreement_revision, operationId: randomUUID() });
  };
  const left = async () => (await (await import("@/lib/billing")).readFreeRequests({ orgId: "org_fr_guests" })).free.left;

  it("count once taken on, and taking one on is refused once the Free Requests are used", async () => {
    await fileMany("org_fr_guests", 2);
    const filed = [];
    for (let i = 0; i < 3; i++) filed.push(await file("org_fr_guests", GUEST));
    const waiting = filed.map((saved) => (saved as { requestId: string }).requestId);
    // Filing as a Guest uses nothing: the submissions wait.
    expect(await left()).toBe(2);
    expect(await takeOn(waiting[0])).toMatchObject({ success: true });
    expect(await left()).toBe(1);
    expect(await takeOn(waiting[1], OTHER)).toMatchObject({ success: true });
    expect(await left()).toBe(0);
    expect(await takeOn(waiting[2])).toEqual({ error: expect.stringMatching(/^This workspace has used its 4 Free Requests\. An Admin needs to pay/) });
    expect((await connection`select taken_on_by from requests where id=${waiting[2]}`)[0].taken_on_by).toBeNull();
    // A Guest can still file: a submission waiting to be taken on isn't a new Request yet.
    expect(await file("org_fr_guests", GUEST)).toMatchObject({ success: true });
  });
});

describe("follow-up Requests", () => {
  it("are new Requests: counted, and refused once the Free Requests are used", async () => {
    const [id] = await fileMany("org_fr_follow", 1);
    await connection`update requests set status='done', expected_impact=${connection.json({ kind: "measurement", version: 2, primary: { key: "conversion", name: "", unit: "percent", current: 50, target: 80, noBaseline: false, check: "" }, measurement: { audience: "all", platform: "all", windowDays: 7, exactDates: false, startDate: "", endDate: "" }, guardrails: [] })}, no_measurable_impact_reason=null where id=${id}`;
    const context = async () => ({ orgId: "org_fr_follow", requestId: id, expectedRevision: (await connection`select agreement_revision from requests where id=${id}`)[0].agreement_revision as number, operationId: randomUUID() });
    const { changeRequestRelease } = await import("../requests/[id]/release-actions");
    as(MEMBER, "org_fr_follow");
    expect(await changeRequestRelease(await context(), { kind: "release", exposureDate: new Date().toISOString().slice(0, 10), evidence: "Full rollout in release log", audienceConfirmed: true, valueBeforeRelease: { value: 50, unit: "%" } })).toMatchObject({ success: true });
    const { createFollowUpRequest } = await import("../requests/[id]/outcome-actions");
    for (const reason of ["Mobile needs it too", "Refunds need it too", "Exports need it too"])
      expect(await createFollowUpRequest(await context(), { reason })).toMatchObject({ success: true });
    expect(await createFollowUpRequest(await context(), { reason: "And invoices" })).toEqual({ error: expect.stringMatching(/^This workspace has used its 4 Free Requests\. An Admin needs to pay/) });
    expect(await requestCount("org_fr_follow")).toBe(4);
  });
});

describe("with billing not enforced", () => {
  it("never blocks a workspace, but still counts what it files", async () => {
    vi.stubEnv("LANE_BILLING_ENFORCED", "");
    await fileMany("org_fr_off", 6);
    expect(await requestCount("org_fr_off")).toBe(6);
    const { readFreeRequests } = await import("@/lib/billing");
    expect((await readFreeRequests({ orgId: "org_fr_off" })).free).toEqual({ total: 4, used: 6, left: 0, usedElsewhere: null });
    // Every blocked action goes through too.
    expect(await review("org_fr_block")).toMatchObject({ success: true });
  });
});
