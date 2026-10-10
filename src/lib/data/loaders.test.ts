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
import { loadProjectScope, loadRequestDetail, loadRequestList } from "./requests";

const ORG = "org_test_a", OTHER_ORG = "org_test_b";
const ADMIN = "user_test_admin_a", MEMBER = "user_test_member_a", OTHER_ADMIN = "user_test_admin_b";
const GUEST = "user_loaders_guest";
const FIXTURE_REQUEST = "de7fe180-b51b-4714-8e82-42b775fe53d4";

const admin: MemberAuth = { userId: ADMIN, orgId: ORG, role: "admin" };
const member: MemberAuth = { userId: MEMBER, orgId: ORG, role: "member" };
const guest: MemberAuth = { userId: GUEST, orgId: ORG, role: "guest" };

const memberProject = randomUUID(), guestProject = randomUUID(), foreignProject = randomUUID();
const memberRequest = randomUUID(), guestRequest = randomUUID(), foreignRequest = randomUUID();
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
  await db.delete(requests).where(inArray(requests.id, [memberRequest, guestRequest, foreignRequest]));
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
    const { result, statements } = await queryCounter.measure(() => loadRequestList(member, { filter: "all", projectFilter: "all" }));
    expect(statements).toBeLessThanOrEqual(1);
    const ids = result.map(row => row.id);
    expect(ids).toEqual(expect.arrayContaining([memberRequest, guestRequest, FIXTURE_REQUEST]));
    expect(ids).not.toContain(foreignRequest);
    const row = result.find(item => item.id === memberRequest)!;
    expect(row).toMatchObject({ projectName: "Loader member project", creatorName: "Test Member", assigneeName: "Test Admin", status: "in_progress" });
  });

  it("limits a guest to Requests they created", async () => {
    const { result, statements } = await queryCounter.measure(() => loadRequestList(guest, { filter: "all", projectFilter: "all" }));
    expect(statements).toBeLessThanOrEqual(1);
    const ids = result.map(row => row.id);
    expect(ids).toContain(guestRequest);
    expect(ids).not.toContain(memberRequest);
    expect(ids).not.toContain(FIXTURE_REQUEST);
  });

  it("applies status and Project filters in SQL", async () => {
    const inProgress = (await loadRequestList(member, { filter: "in_progress", projectFilter: "all" })).map(row => row.id);
    expect(inProgress).toContain(memberRequest);
    expect(inProgress).not.toContain(guestRequest);
    const noProject = (await loadRequestList(member, { filter: "all", projectFilter: "none" })).map(row => row.id);
    expect(noProject).toContain(FIXTURE_REQUEST);
    expect(noProject).not.toContain(memberRequest);
    const inProject = (await loadRequestList(member, { filter: "all", projectFilter: memberProject })).map(row => row.id);
    expect(inProject).toEqual([memberRequest]);
  });
});

describe("loadRequestDetail", () => {
  it("reads the Request, its comments and its uploaded attachments in at most three statements", async () => {
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
    expect(await loadRequestDetail(member, foreignRequest)).toBeNull();
    expect(await loadRequestDetail(guest, memberRequest)).toBeNull();
    expect((await loadRequestDetail(guest, guestRequest))?.request.id).toBe(guestRequest);
  });
});
