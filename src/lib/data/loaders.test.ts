/**
 * Statement ceilings and guard checks for the server loaders (plan items 1.8,
 * 1.9 and 1.15a). Every loader takes the Clerk-derived MemberAuth explicitly,
 * so the only session mock here serves the getUnreadCount parity check.
 *
 * ISOLATION: seeds its own guest, Projects, Requests, comments, attachments
 * and notifications inside the shared org_test_a / org_test_b fixtures and
 * removes them all in afterAll. Assertions on the shared workspace use
 * containment, never exact row counts, because other files seed org_test_a.
 */
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// "server-only" is Next's build-time marker (aliased by the compiler, not a
// runtime dependency); Vitest cannot resolve it, so the loaders get an empty module.
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const session = vi.hoisted(() => ({ userId: "", orgId: "", orgRole: "org:member" }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));

import { db, queryCounter, comments, notifications, profiles, projects, requestAttachments, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { getUnreadCount } from "@/app/(app)/notifications/actions";
import { loadShell } from "./shell";
import { loadProjects } from "./projects";
import { loadUnreadCount } from "./notifications";
import { DONE_PAGE_SIZE, loadOlderDoneRequests, loadProjectScope, loadRequestDetail, loadRequestList } from "./requests";

const ORG = "org_test_a", OTHER_ORG = "org_test_b";
const ADMIN = "user_test_admin_a", MEMBER = "user_test_member_a", OTHER_ADMIN = "user_test_admin_b";
const GUEST = "user_loaders_guest";
const FIXTURE_REQUEST = "de7fe180-b51b-4714-8e82-42b775fe53d4";

const admin: MemberAuth = { userId: ADMIN, orgId: ORG, role: "admin" };
const member: MemberAuth = { userId: MEMBER, orgId: ORG, role: "member" };
const guest: MemberAuth = { userId: GUEST, orgId: ORG, role: "guest" };

const memberProject = randomUUID(), guestProject = randomUUID(), foreignProject = randomUUID();
const memberRequest = randomUUID(), guestRequest = randomUUID(), foreignRequest = randomUUID();
// Enough Done Requests for one full page plus two older ones, oldest first.
const doneRequests = Array.from({ length: DONE_PAGE_SIZE + 2 }, () => randomUUID());
const foreignDone = randomUUID();
const uploadedAttachment = randomUUID(), pendingAttachment = randomUUID();
const notificationIds = Array.from({ length: 7 }, () => randomUUID());

beforeAll(async () => {
  await db.insert(profiles).values({ id: GUEST, fullName: "Loader Guest", email: "loader-guest@test.local", role: "designer" }).onConflictDoNothing();
  await db.insert(projects).values([
    { id: memberProject, orgId: ORG, name: "Loader member project", createdBy: MEMBER },
    { id: guestProject, orgId: ORG, name: "Loader guest project", createdBy: GUEST },
    { id: foreignProject, orgId: OTHER_ORG, name: "Loader foreign project", createdBy: OTHER_ADMIN },
  ]);
  await db.insert(requests).values([
    { id: memberRequest, orgId: ORG, title: "Loader member Request", description: "Seeded by loaders.test.ts", createdBy: MEMBER, projectId: memberProject, status: "in_progress", assignedTo: ADMIN },
    { id: guestRequest, orgId: ORG, title: "Loader guest Request", description: "Seeded by loaders.test.ts", createdBy: GUEST, projectId: guestProject },
    { id: foreignRequest, orgId: OTHER_ORG, title: "Loader foreign Request", description: "Seeded by loaders.test.ts", createdBy: OTHER_ADMIN },
    // Done Requests sit far in the future so they are the newest in org_test_a.
    ...doneRequests.map((id, index) => ({ id, orgId: ORG, title: `Loader Done ${index}`, description: "Seeded by loaders.test.ts", createdBy: MEMBER, status: "done" as const, createdAt: new Date(Date.UTC(2099, 0, 1, 0, 0, index)) })),
    { id: foreignDone, orgId: OTHER_ORG, title: "Loader foreign Done", description: "Seeded by loaders.test.ts", createdBy: OTHER_ADMIN, status: "done" as const, createdAt: new Date(Date.UTC(2099, 0, 1)) },
  ]);
  await db.insert(comments).values([
    { requestId: memberRequest, authorId: MEMBER, body: "First comment", createdAt: new Date("2026-01-01T08:00:00Z") },
    { requestId: memberRequest, authorId: ADMIN, body: "Second comment", createdAt: new Date("2026-01-01T09:00:00Z") },
  ]);
  await db.insert(requestAttachments).values([
    { id: uploadedAttachment, orgId: ORG, requestId: memberRequest, uploadedBy: MEMBER, storagePath: `loaders-test/${uploadedAttachment}`, fileName: "brief.pdf", mimeType: "application/pdf", sizeBytes: 1024, uploadedAt: new Date("2026-01-01T08:30:00Z") },
    { id: pendingAttachment, orgId: ORG, requestId: memberRequest, uploadedBy: MEMBER, storagePath: `loaders-test/${pendingAttachment}`, fileName: "pending.png", mimeType: "image/png", sizeBytes: 2048, uploadedAt: null },
  ]);
  await db.insert(notifications).values([
    // Admin: two unread that count, one read, one in another workspace.
    { id: notificationIds[0], userId: ADMIN, orgId: ORG, type: "comment_added", requestId: memberRequest, actorId: MEMBER },
    { id: notificationIds[1], userId: ADMIN, orgId: ORG, type: "invite_accepted", requestId: null, actorId: MEMBER },
    { id: notificationIds[2], userId: ADMIN, orgId: ORG, type: "request_done", requestId: memberRequest, actorId: MEMBER, readAt: new Date() },
    { id: notificationIds[3], userId: ADMIN, orgId: OTHER_ORG, type: "invite_accepted", requestId: null, actorId: MEMBER },
    // Guest: only the event on their own Request is visible.
    { id: notificationIds[4], userId: GUEST, orgId: ORG, type: "request_picked_up", requestId: guestRequest, actorId: MEMBER },
    { id: notificationIds[5], userId: GUEST, orgId: ORG, type: "comment_added", requestId: memberRequest, actorId: MEMBER },
    { id: notificationIds[6], userId: GUEST, orgId: ORG, type: "invite_accepted", requestId: null, actorId: MEMBER },
  ]);
});

afterAll(async () => {
  await db.delete(notifications).where(inArray(notifications.id, notificationIds));
  await db.delete(requests).where(inArray(requests.id, [memberRequest, guestRequest, foreignRequest, foreignDone, ...doneRequests]));
  await db.delete(projects).where(inArray(projects.id, [memberProject, guestProject, foreignProject]));
  await db.delete(profiles).where(inArray(profiles.id, [GUEST]));
});

describe("loadShell", () => {
  it("returns the profile and the workspace name in one statement", async () => {
    const { result, statements } = await queryCounter.measure(() => loadShell(admin));
    expect(statements).toBeLessThanOrEqual(1);
    expect(result).toEqual({ fullName: "Test Admin", email: "admin-a@test.local", profileRole: "pm", workspaceName: "Test Workspace A" });
  });

  it("reports a missing profile as null and a missing workspace row as a null name", async () => {
    expect(await loadShell({ userId: "user_loaders_nobody", orgId: ORG, role: "member" })).toBeNull();
    expect(await loadShell({ userId: MEMBER, orgId: "org_loaders_missing", role: "member" })).toEqual({
      fullName: "Test Member", email: "member-a@test.local", profileRole: "designer", workspaceName: null,
    });
  });
});

describe("loadProjects", () => {
  it("lists the workspace's Projects for a member in one statement, scoped to the workspace", async () => {
    const { result, statements } = await queryCounter.measure(() => loadProjects(member));
    expect(statements).toBeLessThanOrEqual(1);
    const ids = result.map(project => project.id);
    expect(ids).toContain(memberProject);
    expect(ids).toContain(guestProject);
    expect(ids).not.toContain(foreignProject);
    expect(result).toEqual([...result].sort((a, b) => a.name.localeCompare(b.name)));
  });

  it("limits a guest to the Projects they created or submitted a Request to", async () => {
    const { result, statements } = await queryCounter.measure(() => loadProjects(guest));
    expect(statements).toBeLessThanOrEqual(1);
    const ids = result.map(project => project.id);
    expect(ids).toContain(guestProject);
    expect(ids).not.toContain(memberProject);
  });
});

describe("loadUnreadCount", () => {
  it("counts unread notifications in the workspace in one statement", async () => {
    const { result, statements } = await queryCounter.measure(() => loadUnreadCount(admin));
    expect(statements).toBeLessThanOrEqual(1);
    expect(result).toBe(2);
  });

  it("hides workspace-wide and other members' events from a guest", async () => {
    expect(await loadUnreadCount(guest)).toBe(1);
  });

  it("agrees with the getUnreadCount action, whose visibility rule it repeats", async () => {
    for (const auth of [admin, guest]) {
      Object.assign(session, { userId: auth.userId, orgId: auth.orgId, orgRole: `org:${auth.role}` });
      expect(await getUnreadCount({ orgId: ORG })).toEqual({ success: true, count: await loadUnreadCount(auth) });
    }
  });
});

describe("loadProjectScope", () => {
  it("needs no statement for all, none or a malformed id", async () => {
    for (const [filter, unavailable] of [["all", false], ["none", false], ["bad-id", true]] as const) {
      const { result, statements } = await queryCounter.measure(() => loadProjectScope(member, filter));
      expect(statements).toBe(0);
      expect(result).toEqual({ unavailable });
    }
  });

  it("names an accessible Project in one statement and keeps a guest out of others", async () => {
    const { result, statements } = await queryCounter.measure(() => loadProjectScope(member, memberProject));
    expect(statements).toBeLessThanOrEqual(1);
    expect(result).toEqual({ unavailable: false, name: "Loader member project" });
    expect(await loadProjectScope(guest, memberProject)).toEqual({ unavailable: true, name: undefined });
    expect(await loadProjectScope(guest, guestProject)).toEqual({ unavailable: false, name: "Loader guest project" });
    expect(await loadProjectScope(member, foreignProject)).toEqual({ unavailable: true, name: undefined });
  });
});

describe("loadRequestList", () => {
  it("reads a member's list in one statement, scoped to the workspace", async () => {
    const { result, statements } = await queryCounter.measure(() => loadRequestList(member));
    expect(statements).toBeLessThanOrEqual(1);
    const ids = result.rows.map(row => row.id);
    expect(ids).toEqual(expect.arrayContaining([memberRequest, guestRequest, FIXTURE_REQUEST]));
    expect(ids).not.toContain(foreignRequest);
    const row = result.rows.find(item => item.id === memberRequest)!;
    expect(row).toMatchObject({ projectName: "Loader member project", creatorName: "Test Member", assigneeName: "Test Admin", status: "in_progress" });
  });

  it("limits a guest to Requests they created", async () => {
    const { result, statements } = await queryCounter.measure(() => loadRequestList(guest));
    expect(statements).toBeLessThanOrEqual(1);
    const ids = result.rows.map(row => row.id);
    expect(ids).toContain(guestRequest);
    expect(ids).not.toContain(memberRequest);
    expect(ids).not.toContain(FIXTURE_REQUEST);
    expect(ids).not.toContain(doneRequests[0]);
  });

  it("loads every active status but only the latest page of Done, leaving status and Project to the browser (plan item 1.7)", async () => {
    const { rows, activeCapped, hasOlderDone } = await loadRequestList(member);
    const done = rows.filter(row => row.status === "done").map(row => row.id);
    expect(done).toHaveLength(DONE_PAGE_SIZE);
    expect(done).toEqual(expect.arrayContaining(doneRequests.slice(2)));
    expect(done).not.toContain(doneRequests[0]);
    expect(done).not.toContain(foreignDone);
    expect(hasOlderDone).toBe(true);
    expect(activeCapped).toBe(false);
    expect(rows.map(row => row.status)).toEqual(expect.arrayContaining(["open", "in_progress", "done"]));
    expect(rows.map(row => row.projectId)).toEqual(expect.arrayContaining([memberProject, null]));
  });

  it("pages older Done Requests from the oldest one shown, in one statement and inside the workspace", async () => {
    const { result, statements } = await queryCounter.measure(() => loadOlderDoneRequests(member, doneRequests[2]));
    expect(statements).toBeLessThanOrEqual(1);
    expect(result.rows.map(row => row.id).slice(0, 2)).toEqual([doneRequests[1], doneRequests[0]]);
    expect(result.rows.every(row => row.status === "done")).toBe(true);
    expect(result.hasOlderDone).toBe(false);
    // Another workspace's cursor, a guest's view and a malformed id read nothing.
    expect((await loadOlderDoneRequests(admin, foreignDone)).rows).toEqual([]);
    expect((await loadOlderDoneRequests(guest, doneRequests[2])).rows).toEqual([]);
    const malformed = await queryCounter.measure(() => loadOlderDoneRequests(member, "not-a-uuid"));
    expect(malformed.statements).toBe(0);
    expect(malformed.result).toEqual({ rows: [], hasOlderDone: false });
  });
});

describe("loadRequestDetail", () => {
  it("reads the Request, its comments and its uploaded attachments in at most three statements and no list query (plan item 1.10)", async () => {
    const { result, statements } = await queryCounter.measure(() => loadRequestDetail(member, memberRequest));
    expect(statements).toBeLessThanOrEqual(3);
    expect(result?.request).toMatchObject({ id: memberRequest, title: "Loader member Request", creatorName: "Test Member", assigneeName: "Test Admin", projectName: "Loader member project" });
    expect(result?.comments.map(comment => comment.body)).toEqual(["First comment", "Second comment"]);
    expect(result?.attachments.map(attachment => attachment.id)).toEqual([uploadedAttachment]);
  });

  it("returns null without a statement for a malformed id", async () => {
    const { result, statements } = await queryCounter.measure(() => loadRequestDetail(member, "not-a-uuid"));
    expect(statements).toBe(0);
    expect(result).toBeNull();
  });

  it("keeps the workspace and guest ownership guards", async () => {
    // A guest's parallel comment and attachment reads join back to the Request's guards.
    const blocked = await queryCounter.measure(() => loadRequestDetail(guest, memberRequest));
    expect(blocked.result).toBeNull();
    expect(blocked.statements).toBeLessThanOrEqual(3);
    expect(await loadRequestDetail(member, foreignRequest)).toBeNull();
    expect(await loadRequestDetail(guest, memberRequest)).toBeNull();
    expect((await loadRequestDetail(guest, guestRequest))?.request.id).toBe(guestRequest);
  });
});
