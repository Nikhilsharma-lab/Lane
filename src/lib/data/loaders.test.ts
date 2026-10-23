/**
 * Statement ceilings and guard checks for the server loaders (plan items 1.8,
 * 1.9 and 1.15a). Every loader takes the Clerk-derived MemberAuth explicitly,
 * and the count route also exercises session-derived authorization.
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

import { db, queryCounter, comments, notifications, organizations, profiles, projects, requestAgreements, requestAttachments, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { REQUEST_PRIORITIES } from "@/lib/request-constants";
import { GET as unreadCount } from "@/app/api/notifications/unread/route";
import { loadShell } from "./shell";
import { loadProjects } from "./projects";
import { loadUnreadCount } from "./notifications";
import { DONE_PAGE_SIZE, loadOlderFinishedRequests, loadRequestDetail, loadRequestList } from "./requests";
import { rowDue, rowJourney, type OverviewRequest } from "@/lib/request-overview";

const ORG = "org_test_a", OTHER_ORG = "org_test_b";
const ADMIN = "user_test_admin_a", MEMBER = "user_test_member_a", OTHER_ADMIN = "user_test_admin_b";
const GUEST = "user_loaders_guest";
const FIXTURE_REQUEST = "de7fe180-b51b-4714-8e82-42b775fe53d4";

const admin: MemberAuth = { userId: ADMIN, orgId: ORG, role: "admin" };
const member: MemberAuth = { userId: MEMBER, orgId: ORG, role: "member" };
const guest: MemberAuth = { userId: GUEST, orgId: ORG, role: "guest" };

const memberProject = randomUUID(), guestProject = randomUUID(), foreignProject = randomUUID();
const memberRequest = randomUUID(), guestRequest = randomUUID(), foreignRequest = randomUUID();
// #77: an Open Request with one concern, one Looks good and one unanswered review.
const reviewedRequest = randomUUID();
const reviewer = (userId: string, name: string, decision: { kind: "looks_good" | "concern"; reason: string } | null) => ({
  id: randomUUID(), nominee: { kind: "member" as const, userId }, displayNameAtSelection: name, addedBy: MEMBER, note: "",
  decision: decision && { ...decision, actorId: userId, at: "2026-10-21T10:00:00.000Z" },
});
// Enough Done Requests for one full page plus two older ones, oldest first.
const doneRequests = Array.from({ length: DONE_PAGE_SIZE + 2 }, () => randomUUID());
const foreignDone = randomUUID();
const guestDone = [randomUUID(), randomUUID()];
// #133: Requests along the whole journey, all older than the newest Done one, so a
// status view's database page reaches them from that cursor.
const JOURNEY_ORG = "org_loaders_journey";
const journeyMember: MemberAuth = { userId: MEMBER, orgId: JOURNEY_ORG, role: "member" };
const fingerprint = "a".repeat(64);
const releaseFact = (dueDate: string) => ({ exposureDate: "2026-10-01", audience: "All shoppers", evidence: "Rollout log", dueDate, startDate: "2026-10-01", windowKind: "relative" as const });
const released = (dueDate: string) => ({ version: 1 as const, ownerId: MEMBER, release: releaseFact(dueDate), history: [{ operationId: randomUUID(), fingerprint, actorId: MEMBER, at: "2026-10-02T00:00:00Z", input: { kind: "release" as const, exposureDate: "2026-10-01", evidence: "Rollout log", audienceConfirmed: true as const }, previousRelease: null, release: releaseFact(dueDate), previousOwnerId: MEMBER, ownerId: MEMBER, revision: 1 }] });
const noResult = { version: 1, kind: "exception", reasonCode: "rolled_back", reason: "Rolled back", actorId: MEMBER, ownerId: MEMBER, closedAt: "2026-10-03T00:00:00Z", operationId: randomUUID(), fingerprint, release: null, revision: 1 } as const;
const journeyNow = new Date("2026-10-28T12:00:00Z");
const journeyRequests = { open: randomUUID(), newestDone: randomUUID(), measuringLater: randomUUID(), dueSoon: randomUUID(), overdue: randomUUID(), closedInProgress: randomUUID(), olderDone: randomUUID() };
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
    { id: reviewedRequest, orgId: ORG, title: "Loader reviewed Request", description: "Seeded by loaders.test.ts", createdBy: MEMBER },
    { id: foreignRequest, orgId: OTHER_ORG, title: "Loader foreign Request", description: "Seeded by loaders.test.ts", createdBy: OTHER_ADMIN },
    // Done Requests sit far in the future so they are the newest in org_test_a.
    ...doneRequests.map((id, index) => ({ id, orgId: ORG, title: `Loader Done ${index}`, description: "Seeded by loaders.test.ts", createdBy: MEMBER, status: "done" as const, createdAt: new Date(Date.UTC(2099, 0, 1, 0, 0, index)) })),
    { id: foreignDone, orgId: OTHER_ORG, title: "Loader foreign Done", description: "Seeded by loaders.test.ts", createdBy: OTHER_ADMIN, status: "done" as const, createdAt: new Date(Date.UTC(2099, 0, 1)) },
    ...guestDone.map((id, index) => ({ id, orgId: ORG, title: `Loader guest Done ${index}`, description: "Seeded by loaders.test.ts", createdBy: GUEST, status: "done" as const, createdAt: new Date(Date.UTC(2080, 0, index + 1)) })),
  ]);
  // Released and closed Requests can never be deleted (0029, 0030), so they live in their own
  // workspace, which the test database reset removes.
  await db.insert(organizations).values({ id: JOURNEY_ORG, name: "Loaders journey", slug: "loaders-journey" });
  const journeyRow = (id: string, title: string, at: number, facts: Partial<typeof requests.$inferInsert>) => ({ id, orgId: JOURNEY_ORG, title, description: "Seeded by loaders.test.ts", createdBy: MEMBER, status: "done" as const, createdAt: new Date(Date.UTC(2098, 0, at)), ...facts });
  await db.insert(requests).values([
    journeyRow(journeyRequests.open, "Loader journey Open", 1, { status: "open" }),
    journeyRow(journeyRequests.newestDone, "Loader journey newest Done", 9, {}),
    journeyRow(journeyRequests.measuringLater, "Loader Measuring, due in 10 days", 8, { releaseState: released("2026-11-07") }),
    journeyRow(journeyRequests.dueSoon, "Loader Measuring, due in 2 days", 7, { releaseState: released("2026-10-30") }),
    journeyRow(journeyRequests.overdue, "Loader Measuring, overdue", 6, { releaseState: released("2026-10-20") }),
    journeyRow(journeyRequests.closedInProgress, "Loader closed without a result", 5, { status: "in_progress", assignedTo: MEMBER, exceptionClosure: noResult }),
    journeyRow(journeyRequests.olderDone, "Loader journey older Done", 4, {}),
  ]);
  await db.insert(requestAgreements).values({ requestId: reviewedRequest, orgId: ORG, reviewers: [
    reviewer(ADMIN, "Test Admin", { kind: "concern", reason: "The API cannot page this yet." }),
    reviewer(GUEST, "Loader Guest", { kind: "looks_good", reason: "" }),
    reviewer(OTHER_ADMIN, "Other Admin", null),
  ] });
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
  await db.delete(requests).where(inArray(requests.id, [memberRequest, guestRequest, reviewedRequest, foreignRequest, foreignDone, ...doneRequests, ...guestDone]));
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
  // #136: one read for reminders owed (the bell writes them, no scheduled job), then the count.
  // An insert is added only on a load where a reminder is actually due.
  it("counts unread notifications in the workspace in two statements when no reminder is due", async () => {
    const { result, statements } = await queryCounter.measure(() => loadUnreadCount(admin));
    expect(statements).toBeLessThanOrEqual(2);
    expect(result).toBe(2);
  });

  it("hides workspace-wide and other members' events from a guest", async () => {
    expect(await loadUnreadCount(guest)).toBe(1);
  });

  it("serves the same scoped unread count through the current GET endpoint", async () => {
    for (const auth of [admin, guest]) {
      Object.assign(session, { userId: auth.userId, orgId: auth.orgId, orgRole: `org:${auth.role}` });
      const response = await unreadCount(new Request(`http://lane.test/api/notifications/unread?${new URLSearchParams({ org: ORG })}`));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ count: auth.role === "guest" ? 1 : 2 });
    }
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
    const { rows, activeCapped, hasOlderFinished } = await loadRequestList(member);
    const done = rows.filter(row => row.status === "done").map(row => row.id);
    expect(done).toHaveLength(DONE_PAGE_SIZE);
    expect(done).toEqual(expect.arrayContaining(doneRequests.slice(2)));
    expect(done).not.toContain(doneRequests[0]);
    expect(done).not.toContain(foreignDone);
    expect(hasOlderFinished).toBe(true);
    expect(activeCapped).toBe(false);
    expect(rows.map(row => row.status)).toEqual(expect.arrayContaining(["open", "in_progress", "done"]));
    expect(rows.map(row => row.projectId)).toEqual(expect.arrayContaining([memberProject, null]));
  });

  it("pages older Done Requests from the oldest one shown, in one statement and inside the workspace", async () => {
    const { result, statements } = await queryCounter.measure(() => loadOlderFinishedRequests(member, doneRequests[2]));
    expect(statements).toBeLessThanOrEqual(1);
    expect(result.rows.map(row => row.id).slice(0, 2)).toEqual([doneRequests[1], doneRequests[0]]);
    expect(result.rows.every(row => row.status === "done")).toBe(true);
    expect(result.hasOlderFinished).toBe(false);
    // Another workspace's cursor, a guest's view and a malformed id read nothing.
    expect((await loadOlderFinishedRequests(admin, foreignDone)).rows).toEqual([]);
    expect((await loadOlderFinishedRequests(guest, doneRequests[2])).rows).toEqual([]);
    const malformed = await queryCounter.measure(() => loadOlderFinishedRequests(member, "not-a-uuid"));
    expect(malformed.statements).toBe(0);
    expect(malformed.result).toEqual({ rows: [], hasOlderFinished: false });
  });

  it("does not use a hidden Request as a guest pagination cursor", async () => {
    // Both guest rows predate the hidden member cursor. Without cursor visibility,
    // the hidden UUID reveals itself by returning these otherwise authorized rows.
    for (const cursorId of [doneRequests[2], foreignDone, randomUUID()]) {
      expect(await loadOlderFinishedRequests(guest, cursorId)).toEqual({ rows: [], hasOlderFinished: false });
    }
    const { result, statements } = await queryCounter.measure(() => loadOlderFinishedRequests(guest, guestDone[1]));
    expect(statements).toBeLessThanOrEqual(1);
    expect(result.rows.map(row => row.id)).toEqual([guestDone[0]]);
    expect(result.hasOlderFinished).toBe(false);
  });
});

describe("status views in the database (#133)", () => {
  const journeyOf = (rows: OverviewRequest[]) => rows.map(row => rowJourney(row).label);
  const ids = (rows: { id: string }[]) => rows.map(row => row.id);

  const page = async (view: Parameters<typeof loadOlderFinishedRequests>[2]) => {
    const { result, statements } = await queryCounter.measure(() => loadOlderFinishedRequests(journeyMember, journeyRequests.newestDone, view, journeyNow));
    expect(statements).toBeLessThanOrEqual(1);
    return result.rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() }));
  };

  it("gives every list row the facts its one journey status reads from", async () => {
    const { rows } = await loadRequestList(journeyMember);
    const read = Object.fromEntries(rows.map(row => [row.id, rowJourney({ ...row, createdAt: row.createdAt.toISOString() }).label]));
    expect(read).toEqual({
      [journeyRequests.open]: "Open", [journeyRequests.newestDone]: "Done", [journeyRequests.measuringLater]: "Measuring",
      [journeyRequests.dueSoon]: "Measuring", [journeyRequests.overdue]: "Measuring",
      [journeyRequests.closedInProgress]: "Closed without a result", [journeyRequests.olderDone]: "Done",
    });
  });

  it("returns exactly each status view's Requests from the database", async () => {
    expect(ids(await page("done"))).toEqual([journeyRequests.olderDone]);
    expect(ids(await page("measuring"))).toEqual([journeyRequests.measuringLater, journeyRequests.dueSoon, journeyRequests.overdue]);
    expect(ids(await page("closed"))).toEqual([journeyRequests.closedInProgress]);
    expect(journeyOf(await page("closed"))).toEqual(["Closed without a result"]);
    const due = await page("due");
    expect(ids(due)).toEqual([journeyRequests.dueSoon, journeyRequests.overdue]);
    expect(due.map(row => rowDue(row, journeyNow))).toMatchObject([{ label: "Due in 2 days" }, { label: "Overdue 8 days" }]);
    expect(ids(await page("all"))).toEqual([journeyRequests.measuringLater, journeyRequests.dueSoon, journeyRequests.overdue, journeyRequests.closedInProgress, journeyRequests.olderDone]);
  });

  it("keeps the guest guard on every status view", async () => {
    for (const view of ["done", "measuring", "closed", "due"] as const) {
      const { rows } = await loadOlderFinishedRequests(guest, guestDone[1], view, journeyNow);
      expect(ids(rows).every(id => id === guestDone[0])).toBe(true);
    }
  });
});

describe("review state (#77)", () => {
  const expected = { concerns: [{ name: "Test Admin", reason: "The API cannot page this yet." }], unanswered: 1 };

  it("gives each list row its open concerns and unanswered count, still in one statement", async () => {
    const { result, statements } = await queryCounter.measure(() => loadRequestList(member));
    expect(statements).toBeLessThanOrEqual(1);
    expect(result.rows.find(row => row.id === reviewedRequest)?.reviewState).toEqual(expected);
    expect(result.rows.find(row => row.id === memberRequest)?.reviewState).toBeNull();
  });

  it("gives Request detail the same review state", async () => {
    expect((await loadRequestDetail(member, reviewedRequest))?.request.reviewState).toEqual(expected);
    expect((await loadRequestDetail(member, memberRequest))?.request.reviewState).toBeNull();
  });
});

describe("loadRequestDetail", () => {
  it("reads the Request, its comments and its uploaded attachments in at most three statements and no list query (plan item 1.10)", async () => {
    const { result, statements } = await queryCounter.measure(() => loadRequestDetail(member, memberRequest));
    expect(statements).toBeLessThanOrEqual(3);
    expect(result?.request).toMatchObject({ id: memberRequest, title: "Loader member Request", creatorName: "Test Member", assigneeName: "Test Admin", projectName: "Loader member project" });
    // Plan item 2.5: the strip's code, the panel's priority and the Assignee avatar, from the same statement.
    expect(result?.request.requestNumber).toBeGreaterThan(0);
    expect(REQUEST_PRIORITIES).toContain(result?.request.priority);
    expect(result?.request).toHaveProperty("assigneeAvatarUrl");
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
