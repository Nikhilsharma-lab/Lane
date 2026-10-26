/**
 * #218: Same problem links. Admins and Members link two Requests as Same problem, at any status, Closed included,
 * without changing either record. Linking joins the whole group (two groups combine); removing a link takes only that
 * Request out; both are in the Request's history. Deleting an Open Request removes its membership. Guests see no
 * links; Viewers see them all. Real database, mocked Clerk session.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";

const ORG = "org_same_problem";
const OTHER = "org_same_problem_other";
const ADMIN = "same_problem_admin", MEMBER = "same_problem_member", GUEST = "same_problem_guest", VIEWER = "same_problem_viewer";
const session = vi.hoisted(() => ({ userId: "same_problem_member", orgId: "org_same_problem", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  clerkClient: async () => ({ organizations: { getOrganizationMembershipList: async () => ({ totalCount: 0, data: [] }) } }),
}));

const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

const ctx = { orgId: ORG };
const as = (userId: string, orgRole = "org:member") => Object.assign(session, { userId, orgRole, orgId: ORG });
const actions = () => import("./same-problem-actions");
const link = async (requestId: string, otherRequestId: string) => (await actions()).linkSameProblem({ requestId, otherRequestId }, ctx);
const remove = async (requestId: string) => (await actions()).removeSameProblemLink({ requestId }, ctx);
const read = async (requestId: string) => (await actions()).readSameProblem(requestId, ctx);

let filed = 0;
/** A Request filed a day after the last one, so creation order is filing order. */
async function request(title: string, over: { createdBy?: string; org?: string } = {}): Promise<string> {
  filed += 1;
  const at = new Date(Date.UTC(2026, 0, filed)).toISOString();
  const [{ id }] = await connection`insert into requests (org_id,title,description,created_by,created_at,agreement_revision) values (${over.org ?? ORG},${title},'Checkout drops people',${over.createdBy ?? MEMBER},${at},1) returning id`;
  return id;
}
/** The numbers of a Request's Iterations, in order, as its page lists them. */
async function iterationsOf(requestId: string) {
  const view = await read(requestId);
  if (!("shown" in view) || !view.shown) throw new Error("No Iterations shown");
  return view.iterations?.iterations.map(entry => entry.title) ?? [];
}
const groupOf = async (requestId: string) => (await connection`select group_id from same_problem_members where request_id = ${requestId}`)[0]?.group_id ?? null;
const recordOf = async (requestId: string) => (await connection`select * from requests where id = ${requestId}`)[0];

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Same problem','same-problem'), (${OTHER},'Other','same-problem-other')`;
  for (const [id, name] of [[ADMIN, "Ada Admin"], [MEMBER, "Mo Member"], [GUEST, "Gil Guest"], [VIEWER, "Vi Viewer"]]) {
    await connection`insert into profiles(id,full_name,email) values (${id},${name},${id + "@same-problem.test"})`;
  }
});
afterEach(() => { as(MEMBER); });
// A Closed Request can't be deleted (database rule), so the workspace stays, as in the outcome tests; every run
// starts from a fresh test database.
afterAll(() => connection.end());

describe("linking Requests as Same problem", () => {
  it("lets a Member link two Requests, listed oldest first with the one being read highlighted", async () => {
    const first = await request("Checkout v1"), second = await request("Checkout v2");
    expect(await link(second, first)).toEqual({ success: true });
    const view = await read(second);
    expect(view).toMatchObject({ shown: true, canChange: true, iterations: { current: { number: 2, label: "2nd iteration" } } });
    expect(await iterationsOf(second)).toEqual(["Checkout v1", "Checkout v2"]);
    expect(await iterationsOf(first)).toEqual(["Checkout v1", "Checkout v2"]);
  });

  it("joins the whole group when linking to any Request in it", async () => {
    const a = await request("Search A"), b = await request("Search B"), c = await request("Search C");
    await link(a, b);
    expect(await link(c, a)).toEqual({ success: true });
    expect(await iterationsOf(b)).toEqual(["Search A", "Search B", "Search C"]);
  });

  it("combines two groups when both Requests are already grouped", async () => {
    const a = await request("Onboarding A"), b = await request("Onboarding B"), c = await request("Onboarding C"), d = await request("Onboarding D");
    await link(a, c);
    await link(b, d);
    expect(await link(c, d)).toEqual({ success: true });
    expect(await iterationsOf(a)).toEqual(["Onboarding A", "Onboarding B", "Onboarding C", "Onboarding D"]);
    expect(new Set(await Promise.all([a, b, c, d].map(groupOf))).size).toBe(1);
  });

  it("links a Closed Request without changing its record", async () => {
    const closed = await request("Exports v1"), next = await request("Exports v2");
    await connection`update requests set status = 'done', exception_closure = ${connection.json({
      version: 1, kind: "exception", reasonCode: "rolled_back", reason: "Broke CSV exports", actorId: MEMBER, ownerId: MEMBER,
      closedAt: "2026-02-01T00:00:00.000Z", operationId: crypto.randomUUID(), fingerprint: "f".repeat(64), release: null, revision: 2,
    })}::jsonb, agreement_revision = 2 where id = ${closed}`;
    const before = await recordOf(closed);
    expect(await link(next, closed)).toEqual({ success: true });
    expect(await recordOf(closed)).toEqual(before);
    const view = await read(next);
    expect(view).toMatchObject({ iterations: { iterations: [{ title: "Exports v1", journey: "Closed without a result", outcome: { kind: "closed_without_result", label: "Rolled back", reason: "Broke CSV exports" } }, { title: "Exports v2", current: true }] } });
  });

  it("lets an Admin link and remove too", async () => {
    as(ADMIN, "org:admin");
    const a = await request("Admin A"), b = await request("Admin B");
    expect(await link(a, b)).toEqual({ success: true });
    expect(await remove(a)).toEqual({ success: true });
  });

  it("refuses a Request linked to itself, one already in the group, and one it can't find", async () => {
    const a = await request("Billing A"), b = await request("Billing B"), elsewhere = await request("Elsewhere", { org: OTHER });
    expect(await link(a, a)).toEqual({ error: "A Request can’t be linked to itself." });
    await link(a, b);
    expect(await link(b, a)).toEqual({ error: "These Requests are already linked as Same problem." });
    expect(await link(a, elsewhere)).toEqual({ error: "That Request isn’t available." });
    expect(await link(a, "not-a-request")).toEqual({ error: "Choose a Request to link." });
    expect(await groupOf(elsewhere)).toBeNull();
  });
});

describe("removing a Same problem link", () => {
  it("takes only that Request out of the group", async () => {
    const a = await request("Pricing A"), b = await request("Pricing B"), c = await request("Pricing C");
    await link(a, b);
    await link(c, b);
    expect(await remove(b)).toEqual({ success: true });
    expect(await iterationsOf(a)).toEqual(["Pricing A", "Pricing C"]);
    expect(await read(b)).toMatchObject({ shown: true, iterations: null });
  });

  it("ends a group of two, since one Request is no group", async () => {
    const a = await request("Invite A"), b = await request("Invite B");
    await link(a, b);
    await remove(a);
    expect(await read(b)).toMatchObject({ iterations: null });
    expect(await remove(b)).toEqual({ error: "This Request isn’t linked as Same problem." });
  });
});

describe("history", () => {
  it("records who added and who removed a link, on the Requests involved", async () => {
    const a = await request("History A"), b = await request("History B"), c = await request("History C");
    const number = async (id: string) => (await connection`select request_number from requests where id = ${id}`)[0].request_number;
    await link(a, b);
    as(ADMIN, "org:admin");
    await link(c, a);
    await remove(c);
    as(MEMBER);
    await remove(a);
    const lines = async (id: string) => {
      const view = await read(id);
      return "shown" in view && view.shown ? view.history.map(line => [line.kind, line.actorName, line.other?.requestNumber ?? null]) : null;
    };
    expect(await lines(a)).toEqual([["linked", "Mo Member", await number(b)], ["linked", "Ada Admin", await number(c)], ["removed", "Mo Member", null]]);
    // b's group ended when a was taken out: its history says so, naming a.
    expect(await lines(b)).toEqual([["linked", "Mo Member", await number(a)], ["removed", "Mo Member", await number(a)]]);
    expect(await lines(c)).toEqual([["linked", "Ada Admin", await number(a)], ["removed", "Ada Admin", null]]);
  });
});

describe("deleting an Open Request", () => {
  it("removes its membership", async () => {
    const a = await request("Delete A"), b = await request("Delete B"), c = await request("Delete C");
    await link(a, b);
    await link(c, a);
    expect(await (await import("./actions")).deleteRequest(c, ctx)).toEqual({ success: true });
    expect(await iterationsOf(a)).toEqual(["Delete A", "Delete B"]);
    expect(await groupOf(c)).toBeNull();
  });
});

describe("who sees and changes links", () => {
  it("shows a guest no links and lets them change none, even on their own Request", async () => {
    const own = await request("Guest's own", { createdBy: GUEST }), other = await request("Guest link target");
    await link(own, other);
    as(GUEST, "org:guest");
    expect(await read(own)).toEqual({ shown: false });
    expect(await link(own, other)).toEqual({ error: "Guests can’t link Requests in this workspace." });
    expect(await remove(own)).toEqual({ error: "Guests can’t link Requests in this workspace." });
    expect(await groupOf(own)).not.toBeNull();
  });

  it("shows a Viewer every link and its history, with nothing to change", async () => {
    const a = await request("Viewer A"), b = await request("Viewer B");
    await link(a, b);
    as(VIEWER, "org:viewer");
    expect(await read(a)).toMatchObject({ shown: true, canChange: false, iterations: { iterations: [{ title: "Viewer A" }, { title: "Viewer B" }] }, history: [{ kind: "linked" }] });
  });

  it("refuses a Request it can't find", async () => {
    expect(await read(crypto.randomUUID())).toEqual({ error: "Request unavailable." });
    expect(await read("nope")).toEqual({ error: "Request unavailable." });
  });
});
