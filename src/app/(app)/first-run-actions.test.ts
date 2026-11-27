/**
 * #217: the first run, per person per workspace. The workspace's creator (`organizations.owner_id`) is guided to file a first real
 * Request; everyone who joins later gets a short first run that shows their Inbox. Progress is saved per person,
 * the first run can be skipped and reopened from help, and nothing is created for it but the person's progress.
 * Real database, faked session seam.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";

const ORG = "org_first_run";
const OTHER = "org_first_run_other", OWNERLESS = "org_first_run_ownerless";
const FOUNDER = "first_run_founder", TEAMMATE = "first_run_teammate", VIEWER = "first_run_viewer";
const session = vi.hoisted(() => ({ userId: "first_run_founder", orgId: "org_first_run", role: "admin" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ readSession: async () => (session.userId ? { ...session } : null) }));

const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug,owner_id) values (${ORG},'First run','first-run',${FOUNDER}), (${OTHER},'Other','first-run-other',${FOUNDER}), (${OWNERLESS},'Ownerless','first-run-ownerless',null)`;
  for (const id of [FOUNDER, TEAMMATE, VIEWER]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@first-run.test"})`;
});
afterEach(() => { Object.assign(session, { userId: FOUNDER, orgId: ORG, role: "admin" }); });
afterAll(async () => {
  await connection`delete from organizations where id in (${ORG}, ${OTHER}, ${OWNERLESS})`;
  await connection`delete from profiles where id in (${FOUNDER}, ${TEAMMATE}, ${VIEWER})`;
  await connection.end();
});

const as = (userId: string, role = "member", orgId = ORG) => Object.assign(session, { userId, role, orgId });
const member = () => ({ userId: session.userId, orgId: session.orgId, role: session.role as "admin" | "member" | "guest" | "viewer" });
const load = async () => (await import("@/lib/first-run")).loadFirstRun(member());
const update = async (data: unknown, orgId = ORG) => (await import("./first-run-actions")).updateFirstRun(data as never, { orgId });
/** Everything a first run could have created in a workspace, besides the person's progress. */
const workspaceContents = async (orgId: string) => ({
  requests: (await connection`select count(*)::int as n from requests where org_id = ${orgId}`)[0].n,
  projects: (await connection`select count(*)::int as n from projects where org_id = ${orgId}`)[0].n,
  labels: (await connection`select count(*)::int as n from workspace_labels where org_id = ${orgId}`)[0].n,
  comments: (await connection`select count(*)::int as n from comments c join requests r on r.id = c.request_id where r.org_id = ${orgId}`)[0].n,
  notifications: (await connection`select count(*)::int as n from notifications where org_id = ${orgId}`)[0].n,
  workspaces: (await connection`select count(*)::int as n from organizations where name ilike '%demo%' or name ilike '%sample%'`)[0].n,
});

describe("the workspace's first person", () => {
  it("is guided to file a first real Request, starting at the problem framing, with nothing else created", async () => {
    const before = await workspaceContents(ORG);
    const run = await load();
    expect(run?.view).toEqual({ guide: "first_request", step: "framing", read: [], filed: false });
    expect(run?.free).toEqual({ planState: "free", free: { total: 4, used: 0, left: 4, usedElsewhere: null } });
    expect(await workspaceContents(ORG)).toEqual(before);
  });

  it("keeps the guide decided at their first visit, whoever owner_id names later", async () => {
    await connection`update organizations set owner_id = ${TEAMMATE} where id = ${ORG}`;
    expect((await load())?.view).toMatchObject({ guide: "first_request" });
    await connection`update organizations set owner_id = ${FOUNDER} where id = ${ORG}`;
  });

  it("saves each step read, so the first run resumes where it was", async () => {
    expect(await update({ change: "step", step: "framing" })).toEqual({ success: true });
    expect(await update({ change: "step", step: "prediction" })).toEqual({ success: true });
    expect((await load())?.view).toMatchObject({ step: "reviewers", read: ["framing", "prediction"] });
  });

  it("reopens at the step gone back to, so Back then reload resumes where the person left (A220)", async () => {
    expect(await update({ change: "step", step: "reviewers" })).toEqual({ success: true });
    expect(await update({ change: "back", step: "prediction" })).toEqual({ success: true });
    expect((await load())?.view).toMatchObject({ step: "prediction", read: ["framing"] });
    expect(await update({ change: "step", step: "prediction" })).toEqual({ success: true });
    expect((await load())?.view).toMatchObject({ step: "reviewers", read: ["framing", "prediction"] });
    expect(await update({ change: "back", step: "inbox" })).toEqual({ error: "That step isn’t part of your first run." });
  });

  it("refuses a step from the other guide, and anything that isn't a step", async () => {
    expect(await update({ change: "step", step: "inbox" })).toEqual({ error: "That step isn’t part of your first run." });
    expect(await update({ change: "step", step: "sample_data" })).toEqual({ error: "That step isn’t part of your first run." });
    expect(await update({ change: "demo" })).toEqual({ error: "That step isn’t part of your first run." });
    expect((await load())?.view).toMatchObject({ step: "reviewers" });
  });

  it("knows once their first Request is filed, and shows the Free Requests left", async () => {
    await connection`insert into requests(org_id,title,description,created_by,no_measurable_impact_reason) values (${ORG},'Checkout loses card details','Customers re-enter details',${FOUNDER},'Fixture')`;
    const run = await load();
    expect(run?.view).toMatchObject({ guide: "first_request", filed: true });
    expect(run?.free?.free.left).toBe(3);
  });

  it("finishes it, and finds it again from help at the start", async () => {
    expect(await update({ change: "finish" })).toEqual({ success: true });
    expect((await load())?.view).toBeNull();
    expect(await update({ change: "reopen" })).toEqual({ success: true });
    expect((await load())?.view).toEqual({ guide: "first_request", step: "framing", read: [], filed: true });
  });

  it("can skip it at any step", async () => {
    await update({ change: "step", step: "framing" });
    expect(await update({ change: "skip" })).toEqual({ success: true });
    expect((await load())?.view).toBeNull();
    await update({ change: "reopen" });
  });
});

describe("people who join later", () => {
  it("get the short first run that shows their Inbox, kept apart from anyone else's progress", async () => {
    as(TEAMMATE);
    expect((await load())?.view).toEqual({ guide: "joined" });
    expect(await update({ change: "step", step: "inbox" })).toEqual({ success: true });
    expect(await update({ change: "finish" })).toEqual({ success: true });
    expect((await load())?.view).toBeNull();
    as(FOUNDER, "admin");
    expect((await load())?.view).toMatchObject({ guide: "first_request" });
  });

  it("includes Viewers, whose first run is theirs to skip", async () => {
    as(VIEWER, "viewer");
    expect((await load())?.view).toEqual({ guide: "joined" });
    expect(await update({ change: "skip" })).toEqual({ success: true });
    expect((await load())?.view).toBeNull();
  });

  it("includes everyone while the workspace's creator isn't known", async () => {
    as(FOUNDER, "admin", OWNERLESS);
    expect((await load())?.view).toEqual({ guide: "joined" });
  });

  it("starts a creator who already filed a Request with the first Request guide finished", async () => {
    as(FOUNDER, "admin", OTHER);
    await connection`insert into requests(org_id,title,description,created_by,no_measurable_impact_reason) values (${OTHER},'Filed before first runs','Fixture',${FOUNDER},'Fixture')`;
    expect((await load())?.view).toBeNull();
    expect(await update({ change: "reopen" }, OTHER)).toEqual({ success: true });
    expect((await load())?.view).toMatchObject({ guide: "first_request", step: "framing", filed: true });
  });
});

describe("when the first run can't be changed", () => {
  it("changes nothing for another workspace than the session's, or when signed out", async () => {
    expect(await update({ change: "skip" }, OTHER)).toEqual({ error: "You can’t change the first run in this workspace." });
    Object.assign(session, { userId: null, orgId: null, role: null });
    expect(await update({ change: "skip" })).toMatchObject({ error: expect.any(String) });
    as(FOUNDER, "admin");
    expect((await load())?.view).toMatchObject({ guide: "first_request" });
  });

  it("refuses to change a first run that hasn't started", async () => {
    as(TEAMMATE, "member", OTHER);
    expect(await update({ change: "skip" }, OTHER)).toEqual({ error: "Your first run isn’t ready yet. Reload the page and try again." });
  });
});
