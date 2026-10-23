import { fixtureClerkClient } from "@/test/member-fixtures";
import { requireTestDatabase } from "@/test/test-database";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberAuth } from "./auth-guard";
import { canChange, canSee } from "./request-access-rules";

/**
 * The access rules through every surface that reads or changes a Request:
 * a guest sees and changes only their own Requests, a member sees all and
 * changes their own, an admin changes any, and another workspace sees
 * nothing. Each surface reaches the rule through request-access.ts.
 */

const session = vi.hoisted(() => ({ userId: "", orgId: "", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session, clerkClient: async () => fixtureClerkClient(ORG, [MEMBER, ADMIN]) }));
vi.mock("@/lib/supabase/admin", () => ({
  createServiceClient: () => ({ storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "https://files.test/signed" }, error: null }), remove: async () => ({ error: null }) }) } }),
}));

const ORG = "org_request_access", OTHER = "org_request_access_other";
const GUEST = "user_access_guest", MEMBER = "user_access_member", ADMIN = "user_access_admin", OUTSIDER = "user_access_outsider";
const ROLES = { [GUEST]: "guest", [MEMBER]: "member", [ADMIN]: "admin", [OUTSIDER]: "member" } as const;
let sql: ReturnType<typeof postgres>;
let guestRequest: string, memberRequest: string, memberFile: string;

const as = (userId: keyof typeof ROLES) => Object.assign(session, { userId, orgId: userId === OUTSIDER ? OTHER : ORG, orgRole: `org:${ROLES[userId]}` });
const authOf = (userId: keyof typeof ROLES): MemberAuth => ({ userId, orgId: userId === OUTSIDER ? OTHER : ORG, role: ROLES[userId] });
const actions = () => import("@/app/(app)/requests/[id]/actions");
const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(url.toString(), { max: 2 });
  await sql`insert into organizations(id,name,slug) values (${ORG},'Access','request-access'),(${OTHER},'Other access','request-access-other')`;
  for (const id of Object.keys(ROLES)) await sql`insert into profiles(id,full_name,email) values (${id},${id},${id + "@access.test"})`;
});
beforeEach(async () => {
  await sql`delete from requests where org_id = ${ORG}`;
  guestRequest = randomUUID(); memberRequest = randomUUID(); memberFile = randomUUID();
  await sql`insert into requests(id,org_id,title,description,created_by) values
    (${guestRequest},${ORG},'Guest Request','Searchable access fixture',${GUEST}),
    (${memberRequest},${ORG},'Member Request','Searchable access fixture',${MEMBER})`;
  await sql`insert into request_attachments(id,org_id,request_id,uploaded_by,storage_path,file_name,mime_type,size_bytes,uploaded_at)
    values (${memberFile},${ORG},${memberRequest},${MEMBER},${`${ORG}/${memberRequest}/${memberFile}/notes.pdf`},'notes.pdf','application/pdf',10,now())`;
  // A notification delivered to the guest about a Request they can't see grants nothing.
  await sql`insert into notifications(user_id,org_id,type,request_id,actor_id) values (${GUEST},${ORG},'comment_added',${memberRequest},${MEMBER}),(${GUEST},${ORG},'comment_added',${guestRequest},${MEMBER})`;
});
afterAll(async () => {
  await sql`delete from organizations where id in (${ORG},${OTHER})`;
  await sql`delete from profiles where id in ${sql(Object.keys(ROLES))}`;
  await sql.end();
});

describe("seeing a Request", () => {
  it("lists, finds and notifies a guest about their own Requests only", async () => {
    const { loadRequestList, loadRequestDetail } = await import("./data/requests");
    const { loadWorkspaceSearch } = await import("./data/search");
    const { loadNotifications } = await import("./data/notifications");
    const guest = authOf(GUEST);
    expect(ids((await loadRequestList(guest)).rows)).toEqual([guestRequest]);
    expect(await loadRequestDetail(guest, memberRequest)).toBeNull();
    expect(await loadRequestDetail(guest, guestRequest)).not.toBeNull();
    expect(ids((await loadWorkspaceSearch(guest, { query: "access fixture", requestsPage: 0, projectsPage: 0 })).requests.items)).toEqual([guestRequest]);
    expect((await loadNotifications(guest)).map((n) => n.requestId)).toEqual([guestRequest]);
  });
  it("lists every Request in the workspace for a member and an admin, and none for another workspace", async () => {
    const { loadRequestList, loadRequestDetail } = await import("./data/requests");
    for (const user of [MEMBER, ADMIN] as const) expect(ids((await loadRequestList(authOf(user))).rows)).toEqual([guestRequest, memberRequest].sort());
    expect((await loadRequestList(authOf(OUTSIDER))).rows).toEqual([]);
    expect(await loadRequestDetail(authOf(OUTSIDER), memberRequest)).toBeNull();
  });
  it("lets a guest comment on and download from their own Requests only, reading anything else as missing", async () => {
    const api = await actions();
    const comment = (id: string) => { const form = new FormData(); form.set("body", "A comment"); return api.addComment(id, form, { orgId: ORG }); };
    as(GUEST);
    expect(await comment(memberRequest)).toEqual({ error: "Not found" });
    expect(await comment(guestRequest)).toMatchObject({ success: true });
    expect(await api.getAttachmentDownloadUrl(memberFile, { orgId: ORG })).toEqual({ error: "File not found" });
    as(MEMBER);
    expect(await comment(guestRequest)).toMatchObject({ success: true });
    expect(await api.getAttachmentDownloadUrl(memberFile, { orgId: ORG })).toEqual({ success: true, url: "https://files.test/signed" });
    as(OUTSIDER);
    expect(await api.getAttachmentDownloadUrl(memberFile, { orgId: OTHER })).toEqual({ error: "File not found" });
  });
  it("reads reviews, release and outcome only where the Request is visible", async () => {
    const { readReviews } = await import("@/app/(app)/requests/[id]/reviewer-actions");
    const { readRequestRelease } = await import("@/app/(app)/requests/[id]/release-actions");
    const { readRequestOutcome } = await import("@/app/(app)/requests/[id]/outcome-actions");
    as(GUEST);
    for (const read of [readReviews, readRequestRelease, readRequestOutcome]) {
      expect(await read(memberRequest, { orgId: ORG })).toHaveProperty("error");
      expect(await read(guestRequest, { orgId: ORG })).not.toHaveProperty("error");
    }
  });
});

describe("changing a Request", () => {
  it("lets its creator (a guest included) and an admin set priority, and nobody else", async () => {
    const api = await actions();
    as(GUEST);
    expect(await api.setRequestPriority(guestRequest, "high", { orgId: ORG })).toMatchObject({ success: true });
    expect(await api.setRequestPriority(memberRequest, "high", { orgId: ORG })).toHaveProperty("error");
    as(MEMBER);
    expect(await api.setRequestPriority(guestRequest, "low", { orgId: ORG })).toHaveProperty("error");
    as(ADMIN);
    expect(await api.setRequestPriority(guestRequest, "urgent", { orgId: ORG })).toMatchObject({ success: true, priority: "urgent" });
  });
  it("lets its creator or an admin delete it; a guest can't learn another Request exists", async () => {
    const api = await actions();
    as(GUEST);
    expect(await api.deleteRequest(memberRequest, { orgId: ORG })).toEqual({ error: "Not found" });
    as(MEMBER);
    expect(await api.deleteRequest(guestRequest, { orgId: ORG })).toEqual({ error: "Only the Requester or a workspace admin can delete this Request." });
    as(ADMIN);
    expect(await api.deleteRequest(guestRequest, { orgId: ORG })).toEqual({ success: true });
  });
  it("offers edits in the list exactly where the save allows them", async () => {
    const { loadRequestList } = await import("./data/requests");
    const editable = async (user: keyof typeof ROLES) => (await loadRequestList(authOf(user))).rows.filter((row) => row.canEdit).map((row) => row.id).sort();
    expect(await editable(GUEST)).toEqual([guestRequest]);
    expect(await editable(MEMBER)).toEqual([memberRequest]);
    expect(await editable(ADMIN)).toEqual([guestRequest, memberRequest].sort());
  });
  it("keeps pickup and Mark Done for members and admins", async () => {
    const api = await actions();
    as(GUEST);
    expect(await api.pickUpRequest(guestRequest, { orgId: ORG })).toEqual({ error: "You can't change Requests in this workspace." });
    expect(await api.markDone(guestRequest, { orgId: ORG })).toEqual({ error: "You can't change Requests in this workspace." });
    as(MEMBER);
    expect(await api.pickUpRequest(guestRequest, { orgId: ORG })).toMatchObject({ success: true });
  });
});

describe("a signed-out caller", () => {
  it("is told the session ended instead of a missing Request, so the browser renews it and retries", async () => {
    const api = await actions();
    const { SESSION_ENDED } = await import("./auth-guard");
    Object.assign(session, { userId: "", orgId: "", orgRole: "" });
    const form = new FormData(); form.set("body", "A comment");
    expect(await api.addComment(guestRequest, form, { orgId: ORG })).toEqual({ error: SESSION_ENDED });
    expect(await api.pickUpRequest(guestRequest, { orgId: ORG })).toEqual({ error: SESSION_ENDED });
    expect(await api.deleteRequest(guestRequest, { orgId: ORG })).toEqual({ error: SESSION_ENDED });
  });
});

describe("the rules on a loaded row", () => {
  it("match the query rules", () => {
    const own = { createdBy: GUEST }, other = { createdBy: MEMBER };
    expect([canSee({ userId: GUEST, role: "guest" }, own), canSee({ userId: GUEST, role: "guest" }, other)]).toEqual([true, false]);
    expect(canSee({ userId: MEMBER, role: "member" }, own)).toBe(true);
    expect([canChange({ userId: GUEST, role: "guest" }, own), canChange({ userId: MEMBER, role: "member" }, own), canChange({ userId: ADMIN, role: "admin" }, own)]).toEqual([true, false, true]);
  });
});

describe("every read and change", () => {
  it("states the rules only through request-access, never inline", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join, relative } = await import("node:path");
    const root = join(process.cwd(), "src");
    const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
    const inline = [
      /role === ["']guest["'] \? eq\(\w+\.createdBy/,
      /role === ["']admin["'] \? undefined : eq\(\w+\.createdBy/,
      /\$\{requests\.createdBy\} = \$\{auth\.userId\}/,
      /createdBy === auth\.userId|createdBy !== auth\.userId/,
    ];
    const found = files(root)
      .filter((path) => !/request-access(-rules)?\.ts$/.test(path))
      .flatMap((path) => readFileSync(path, "utf8").split("\n").flatMap((line, index) =>
        inline.some((rule) => rule.test(line)) ? [`${relative(root, path)}:${index + 1}`] : []));
    expect(found).toEqual([]);
  });
});
