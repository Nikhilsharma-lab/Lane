/**
 * #216 (spec #195, seam 5): a workspace whose plan lapsed. Its record is never held hostage: everything already
 * filed keeps working (picking up, comments, Done, releasing, closing) and Result due reminders still go out;
 * nothing is deleted. Only creating new Requests waits for payment: new Requests, follow-ups and taking on a Guest
 * submission. Real database, mocked Clerk, roles switched per call, the payment provider swapped for the recording
 * stand-in, billing enforced.
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";

const ORG = "org_lapsed_plan";
const [MEMBER, OTHER, GUEST, ADMIN] = ["lapsed_member", "lapsed_other", "lapsed_guest", "lapsed_admin"];
const ROLES: Record<string, string> = { [MEMBER]: "org:member", [OTHER]: "org:member", [GUEST]: "org:guest", [ADMIN]: "org:admin" };
const session = vi.hoisted(() => ({ userId: "lapsed_member", orgId: "org_lapsed_plan", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/ai/triage", () => ({ triageRequest: async () => ({ ok: true, triage: { classification: "problem", reframedProblem: null, extractedSolution: null } }) }));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: async () => ({ allowed: true }) }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async ({ organizationId, userId }: { organizationId?: string; userId?: string[] } = {}) => {
        const people = organizationId && organizationId !== "org_lapsed_plan" ? []
          : Object.entries({ lapsed_member: "org:member", lapsed_other: "org:member", lapsed_guest: "org:guest", lapsed_admin: "org:admin" }).filter(([id]) => !userId || userId.includes(id));
        return { totalCount: people.length, data: people.map(([id, role]) => ({ organization: { id: "org_lapsed_plan" }, role, publicUserData: { userId: id, identifier: `${id}@lapsed.example`, firstName: "Name", lastName: id } })) };
      },
      getOrganizationInvitationList: async () => ({ totalCount: 0, data: [] }),
    },
  }),
}));

const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 2, prepare: false, onnotice: () => {} });

const conversion = { kind: "measurement", version: 2, primary: { key: "conversion", name: "", unit: "percent", current: 50, target: 80, noBaseline: false, check: "" }, measurement: { audience: "all", platform: "all", windowDays: 7, exactDates: false, startDate: "", endDate: "" }, guardrails: [] };
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const draft = { title: "Export is hard to find", description: "Customers can't find where to export their invoices.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "" };
const prediction = { kind: "no_measurable_impact" as const, reason: "Keeps invoices where people expect them." };

function as(userId: string) {
  session.userId = userId;
  session.orgRole = ROLES[userId];
}
const ctx = { orgId: ORG };
const intake = () => import("./intake/actions");
const requestActions = () => import("./requests/[id]/actions");
const revision = async (id: string) => (await connection`select agreement_revision from requests where id=${id}`)[0].agreement_revision as number;
const change = async (id: string) => ({ orgId: ORG, requestId: id, expectedRevision: await revision(id), operationId: randomUUID() });
const requestCount = async () => (await connection`select count(*)::int as n from requests where org_id=${ORG}`)[0].n as number;

async function file(userId = MEMBER) {
  as(userId);
  const reviewed = await (await intake()).runTriage({ ...draft, ...(userId === GUEST ? {} : { expectedImpact: prediction }) }, ctx);
  if (!reviewed.success) return reviewed;
  return (await intake()).saveRequest({ token: reviewed.token, editedProblemText: null }, ctx);
}
/** A Request at Done with a measured prediction, the way the journey leaves it. */
async function doneRequest(title: string) {
  const [row] = await connection`insert into requests(org_id,title,description,created_by,status,expected_impact,done_at,created_at) values (${ORG},${title},'Fixture',${MEMBER},'done',${connection.json(conversion)},now(),now() - interval '30 days') returning id`;
  return row.id as string;
}
async function release(id: string) {
  as(MEMBER);
  const { changeRequestRelease } = await import("./requests/[id]/release-actions");
  return changeRequestRelease(await change(id), { kind: "release", exposureDate: day(-10), evidence: "Full rollout in release log", audienceConfirmed: true, valueBeforeRelease: { value: 50, unit: "%" } });
}

let openRequest: string;
let doneForRelease: string;
let measuring: string;
let dueForResult: string;
let guestSubmission: string;
let before: number;

beforeAll(async () => {
  vi.stubEnv("TRIAGE_TOKEN_SECRET", "lapsed-plan-test-secret".repeat(3));
  vi.stubEnv("LANE_BILLING_ENFORCED", "1");
  for (const id of Object.keys(ROLES)) await connection`insert into profiles(id,full_name,email) values (${id},${"Name " + id},${id + "@lapsed.example"}) on conflict (id) do nothing`;
  await connection`insert into organizations(id,name,slug) values (${ORG},'Lapsed plan','lapsed-plan')`;
  const billing = await import("@/lib/billing");
  await billing.claimFreeRequests(ctx, "founder@lapsed-plan.example");

  // The workspace pays (at the list price: this workspace outlives the file, so it takes no founding place), and
  // files more Requests than its Free Requests while it does.
  const { recordingPaymentProvider } = await import("@/lib/payment-provider");
  const provider = recordingPaymentProvider();
  await billing.recordPaymentEvent({ kind: "checkout_completed", orgId: ORG, checkoutId: "cs_lapsed_plan", customerId: "cus_lapsed_plan", subscriptionId: "sub_lapsed_plan", period: "monthly", foundingDiscount: false });
  const filed = [];
  for (let i = 0; i < 5; i++) filed.push(await file());
  openRequest = (filed[0] as { requestId: string }).requestId;
  guestSubmission = ((await file(GUEST)) as { requestId: string }).requestId;
  doneForRelease = await doneRequest("Released while lapsed");
  measuring = await doneRequest("Closed while lapsed");
  dueForResult = await doneRequest("Result due while lapsed");
  for (const id of [measuring, dueForResult]) { const released = await release(id); if (!("success" in released)) throw Error(`release should pass while paying: ${JSON.stringify(released)}`); }

  // Then the plan ends: the provider says so, and the workspace lapses.
  const ended = await provider.readEvent(provider.changeSubscription("sub_lapsed_plan", { state: "ended" }), provider.headers(), new Date());
  if (!ended.ok || !ended.event) throw Error("The stand-in should report the plan ended");
  await billing.recordPaymentEvent(ended.event);
  before = await requestCount();
});
beforeEach(() => {
  vi.stubEnv("TRIAGE_TOKEN_SECRET", "lapsed-plan-test-secret".repeat(3));
  vi.stubEnv("LANE_BILLING_ENFORCED", "1");
});
afterEach(() => vi.unstubAllEnvs());
// Released Requests' history can't be deleted, so this workspace stays until the next reset (as in the outcome
// action tests).
afterAll(() => connection.end());

describe("a workspace whose plan lapsed", () => {
  it("is lapsed, with nothing deleted", async () => {
    const { readPlan } = await import("@/lib/billing");
    expect(await readPlan(ctx)).toMatchObject({ planState: "lapsed", subscription: false, customer: true });
    // 5 filed while paying, a Guest submission and 3 at Done: all still there.
    expect(before).toBe(9);
  });

  it("keeps work moving: picking up, comments and Done", async () => {
    const actions = await requestActions();
    as(OTHER);
    expect(await actions.pickUpRequest(openRequest, ctx)).toMatchObject({ success: true });
    const form = new FormData();
    form.set("body", "Still working on it");
    expect(await actions.addComment(openRequest, form, ctx)).toMatchObject({ success: true });
    expect(await actions.markDone(openRequest, ctx)).toMatchObject({ success: true });
  });

  it("keeps releasing and closing", async () => {
    expect(await release(doneForRelease)).toMatchObject({ success: true });
    const { changeRequestOutcome } = await import("./requests/[id]/outcome-actions");
    as(MEMBER);
    expect(await changeRequestOutcome(await change(measuring), {
      kind: "measured", primary: { kind: "numeric", actual: 62 }, guardrails: [], evidence: "Analytics dashboard export", observedFrom: day(-10), observedTo: day(-3),
    })).toMatchObject({ success: true });
  });

  it("still gets its Result due reminders", async () => {
    const { runDailyDelivery } = await import("@/lib/inbox-delivery");
    const { recordingMessenger } = await import("@/lib/messenger");
    const messenger = recordingMessenger();
    await runDailyDelivery({ now: new Date(), messenger, appUrl: "https://lane.test" });
    const toRequester = messenger.messages.filter((message) => message.to === `${MEMBER}@lapsed.example`);
    expect(toRequester).toEqual(expect.arrayContaining([expect.objectContaining({ subject: expect.stringMatching(/Result due.*Result due while lapsed/i) })]));
  });

  it("blocks only creating new Requests: a new Request, a follow-up, or taking on a Guest submission", async () => {
    const lapsed = /^This workspace’s plan has lapsed\. An Admin needs to pay for Lane/;
    expect(await file(MEMBER)).toEqual({ success: false, error: { code: "billing_blocked", message: expect.stringMatching(lapsed) } });
    expect(await file(ADMIN)).toEqual({ success: false, error: { code: "billing_blocked", message: expect.stringMatching(lapsed) } });
    const { createFollowUpRequest } = await import("./requests/[id]/outcome-actions");
    as(MEMBER);
    expect(await createFollowUpRequest(await change(measuring), { reason: "Mobile needs it too" })).toEqual({ error: expect.stringMatching(lapsed) });
    const { takeOnGuestSubmission } = await import("./requests/[id]/take-on-actions");
    expect(await takeOnGuestSubmission(await change(guestSubmission))).toEqual({ error: expect.stringMatching(lapsed) });
    // A Guest can still file: a submission waiting to be taken on isn't a new Request yet.
    expect(await file(GUEST)).toMatchObject({ success: true });
    expect(await requestCount()).toBe(before + 1);
  });

  it("blocks nothing while billing isn't enforced", async () => {
    vi.stubEnv("LANE_BILLING_ENFORCED", "");
    expect(await file(MEMBER)).toMatchObject({ success: true });
  });
});
