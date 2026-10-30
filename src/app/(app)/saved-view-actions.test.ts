/**
 * #219: saved views. Anyone in the workspace, Viewers and Guests included, saves the Requests list's current filters
 * under a name, then renames, updates or deletes it. Views are personal: nobody else sees or changes them. Opening one
 * applies its filters through the normal list, so it never shows more than the person may see.
 * Real database, mocked Clerk session.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";
import type { OverviewRequest } from "@/lib/request-overview";

const ORG = "org_saved_views";
const OTHER = "org_saved_views_other";
const MEMBER = "saved_views_member", TEAMMATE = "saved_views_teammate", GUEST = "saved_views_guest", VIEWER = "saved_views_viewer";
const session = vi.hoisted(() => ({ userId: "saved_views_member" as string | null, orgId: "org_saved_views", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ ...session }) }));

const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

let website: string, otherWorkspaceProject: string, hiddenFromGuest: string;
let guestsRequest: string, membersWebsiteRequest: string;

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Saved views','saved-views'), (${OTHER},'Other','saved-views-other')`;
  for (const id of [MEMBER, TEAMMATE, GUEST, VIEWER]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@saved-views.test"})`;
  [{ id: website }] = await connection`insert into projects(org_id,name,created_by) values (${ORG},'Website',${MEMBER}) returning id`;
  [{ id: hiddenFromGuest }] = await connection`insert into projects(org_id,name,created_by) values (${ORG},'Billing',${MEMBER}) returning id`;
  [{ id: otherWorkspaceProject }] = await connection`insert into projects(org_id,name,created_by) values (${OTHER},'Elsewhere',${MEMBER}) returning id`;
  [{ id: guestsRequest }] = await connection`insert into requests(org_id,title,description,created_by,project_id) values (${ORG},'Guest checkout breaks','Guests cannot pay',${GUEST},${website}) returning id`;
  [{ id: membersWebsiteRequest }] = await connection`insert into requests(org_id,title,description,created_by,project_id) values (${ORG},'Hero is slow','The homepage hero loads slowly',${MEMBER},${website}) returning id`;
  await connection`insert into requests(org_id,title,description,created_by,project_id) values (${ORG},'Invoices are confusing','People misread invoices',${MEMBER},${hiddenFromGuest})`;
});
afterEach(() => { Object.assign(session, { userId: MEMBER, orgId: ORG, orgRole: "org:member" }); });
afterAll(async () => {
  await connection`delete from organizations where id in (${ORG}, ${OTHER})`;
  await connection`delete from profiles where id in (${MEMBER}, ${TEAMMATE}, ${GUEST}, ${VIEWER})`;
  await connection.end();
});

const as = (userId: string | null, orgRole = "org:member", orgId = ORG) => Object.assign(session, { userId, orgRole, orgId });
const actions = () => import("./saved-view-actions");
const ctx = { orgId: ORG };
/** The views the navigation shows the signed-in person. */
async function myViews() {
  const { loadSavedViews } = await import("@/lib/data/saved-views");
  return loadSavedViews({ userId: session.userId!, orgId: session.orgId, role: session.orgRole.replace("org:", "") as "member" });
}
const stored = (orgId = ORG) => connection`select owner_id, name, filters from saved_views where org_id = ${orgId} order by owner_id, name`;

describe("saving the list's filters", () => {
  it("saves the current status view and Project under a name, for the navigation", async () => {
    const result = await (await actions()).saveView({ name: "  Website in progress ", filters: { status: "in_progress", project: website } }, ctx);
    expect(result).toMatchObject({ ok: true, view: { name: "Website in progress", filters: { status: "in_progress", project: website } } });
    expect(await myViews()).toEqual([{ id: (result as { view: { id: string } }).view.id, name: "Website in progress", filters: { status: "in_progress", project: website } }]);
  });

  it("refuses a second view with the same name, ignoring case", async () => {
    expect(await (await actions()).saveView({ name: "website IN progress", filters: { status: "all", project: "all" } }, ctx))
      .toEqual({ error: "You already have a view called “website IN progress”. Choose another name." });
  });

  it("refuses an empty or too-long name", async () => {
    expect(await (await actions()).saveView({ name: "  ", filters: { status: "all", project: "all" } }, ctx)).toEqual({ error: "Give the view a name." });
    expect(await (await actions()).saveView({ name: "x".repeat(61), filters: { status: "all", project: "all" } }, ctx)).toEqual({ error: "Keep the name to 60 characters or fewer." });
  });

  it("refuses filters the list doesn't have, and a Project from another workspace", async () => {
    expect(await (await actions()).saveView({ name: "Shipped", filters: { status: "shipped", project: "all" } }, ctx)).toEqual({ error: "Those filters can't be saved. Reload the page and try again." });
    expect(await (await actions()).saveView({ name: "Elsewhere", filters: { status: "all", project: otherWorkspaceProject } }, ctx)).toEqual({ error: "That Project isn't available. Choose another and try again." });
  });

  it("keeps the workspace from the page and the owner from the session", async () => {
    as(MEMBER, "org:member", OTHER);
    expect(await (await actions()).saveView({ name: "Mine", filters: { status: "all", project: "all" } }, ctx)).toEqual({ error: "You can't save views in this workspace." });
    as(null);
    expect(await (await actions()).saveView({ name: "Mine", filters: { status: "all", project: "all" } }, ctx)).toEqual({ error: "Your session ended. Sign in again to continue.", sessionExpired: true });
    expect(await stored(OTHER)).toEqual([]);
  });
});

describe("a view is its owner's alone", () => {
  let viewId: string;
  beforeAll(async () => {
    const result = await (await actions()).saveView({ name: "Open work", filters: { status: "open", project: "all" } }, ctx);
    viewId = (result as { view: { id: string } }).view.id;
  });

  it("is renamed, updated and deleted by its owner", async () => {
    const { renameSavedView, updateSavedView, deleteSavedView } = await actions();
    expect(await renameSavedView({ id: viewId, name: "Open, everything" }, ctx)).toMatchObject({ ok: true, view: { id: viewId, name: "Open, everything" } });
    expect(await updateSavedView({ id: viewId, filters: { status: "open", project: "none" } }, ctx)).toMatchObject({ ok: true, view: { id: viewId, filters: { status: "open", project: "none" } } });
    expect((await myViews()).find(view => view.id === viewId)).toEqual({ id: viewId, name: "Open, everything", filters: { status: "open", project: "none" } });
    expect(await renameSavedView({ id: viewId, name: "Website in progress" }, ctx)).toEqual({ error: "You already have a view called “Website in progress”. Choose another name." });
    expect(await deleteSavedView({ id: viewId }, ctx)).toEqual({ ok: true });
    expect((await myViews()).map(view => view.id)).not.toContain(viewId);
  });

  it("is invisible and unchangeable to a teammate, even an Admin", async () => {
    const { saveView, renameSavedView, updateSavedView, deleteSavedView } = await actions();
    const kept = (await saveView({ name: "Done this week", filters: { status: "done", project: "all" } }, ctx) as { view: { id: string } }).view.id;
    const before = await stored();
    for (const role of ["org:member", "org:admin"]) {
      as(TEAMMATE, role);
      expect(await myViews()).toEqual([]);
      expect(await renameSavedView({ id: kept, name: "Taken" }, ctx)).toEqual({ error: "That view isn't saved any more." });
      expect(await updateSavedView({ id: kept, filters: { status: "all", project: "all" } }, ctx)).toEqual({ error: "That view isn't saved any more." });
      expect(await deleteSavedView({ id: kept }, ctx)).toEqual({ error: "That view isn't saved any more." });
    }
    expect(await stored()).toEqual(before);
    // The teammate's own view of the same name is theirs, beside the owner's.
    expect(await saveView({ name: "Done this week", filters: { status: "done", project: "all" } }, ctx)).toMatchObject({ ok: true });
  });

  it("can't be reached from another workspace", async () => {
    as(MEMBER, "org:member", OTHER);
    expect(await myViews()).toEqual([]);
    const [{ id }] = await connection`select id from saved_views where org_id = ${ORG} and owner_id = ${MEMBER} limit 1`;
    expect(await (await actions()).deleteSavedView({ id }, { orgId: OTHER })).toEqual({ error: "That view isn't saved any more." });
  });
});

describe("Viewers and Guests", () => {
  it("lets a Viewer save, rename, update and delete their own views", async () => {
    as(VIEWER, "org:viewer");
    const { saveView, renameSavedView, updateSavedView, deleteSavedView } = await actions();
    const saved = await saveView({ name: "Measuring", filters: { status: "measuring", project: website } }, ctx);
    expect(saved).toMatchObject({ ok: true, view: { name: "Measuring" } });
    const id = (saved as { view: { id: string } }).view.id;
    expect(await renameSavedView({ id, name: "Measuring now" }, ctx)).toMatchObject({ ok: true });
    expect(await updateSavedView({ id, filters: { status: "due", project: website } }, ctx)).toMatchObject({ ok: true });
    expect(await myViews()).toEqual([{ id, name: "Measuring now", filters: { status: "due", project: website } }]);
    expect(await deleteSavedView({ id }, ctx)).toEqual({ ok: true });
  });

  it("lets a Guest save a view of a Project they can see, and not one they can't", async () => {
    as(GUEST, "org:guest");
    const { saveView } = await actions();
    expect(await saveView({ name: "Website", filters: { status: "all", project: website } }, ctx)).toMatchObject({ ok: true });
    expect(await saveView({ name: "Billing", filters: { status: "all", project: hiddenFromGuest } }, ctx)).toEqual({ error: "That Project isn't available. Choose another and try again." });
  });

  it("opens a Guest's view through the normal list, so it shows only their own Requests", async () => {
    as(GUEST, "org:guest");
    const [view] = await myViews();
    const { loadRequestList } = await import("@/lib/data/requests");
    const { matchesListFilters } = await import("@/lib/request-overview");
    const list = await loadRequestList({ userId: GUEST, orgId: ORG, role: "guest" });
    const shown = list.rows
      .map(row => ({ ...row, createdAt: row.createdAt.toISOString() }) as unknown as OverviewRequest)
      .filter(row => matchesListFilters(row, { ...view.filters, title: "", requestType: "" }));
    expect(shown.map(row => row.id)).toEqual([guestsRequest]);
    expect(shown.map(row => row.id)).not.toContain(membersWebsiteRequest);
  });
});
