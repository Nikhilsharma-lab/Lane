/**
 * Notifications read-path forge proof.
 *
 * Proves the read boundary: a user reads ONLY their own notifications
 * scoped to their workspace, and can ONLY mark their own as read.
 * The security test: marking another user's notification is a no-op.
 *
 * ISOLATION: seeds its OWN workspace, profiles, members, notifications.
 * Does NOT touch any row another test file uses.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import {
  db,
  workspaces,
  profiles,
  requests,
  notifications,
} from "@/db";
import { eq } from "drizzle-orm";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let mockSession = { userId: "", orgId: "", orgRole: "" };

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => mockSession),
}));

const WS_ID = "00000000-0000-4000-b000-00000000f001";
const USER_A = "00000000-0000-4000-b000-00000000f010";
const USER_B = "00000000-0000-4000-b000-00000000f020";
const GUEST_USER = "00000000-0000-4000-b000-00000000f030";

const REQ_ID = "00000000-0000-4000-b000-00000000f101";
const GUEST_REQ = "00000000-0000-4000-b000-00000000f102";

const NOTIF_A1 = "00000000-0000-4000-b000-00000000f201";
const NOTIF_A2 = "00000000-0000-4000-b000-00000000f202";
const NOTIF_B1 = "00000000-0000-4000-b000-00000000f203";
const NOTIF_GUEST = "00000000-0000-4000-b000-00000000f204";

beforeAll(async () => {
  await db
    .insert(workspaces)
    .values({ id: WS_ID, name: "Read Test WS", slug: "read-test-ws" })
    .onConflictDoNothing();

  await db
    .insert(profiles)
    .values([
      { id: USER_A, fullName: "User A", email: "a@read.test", role: "pm" },
      { id: USER_B, fullName: "User B", email: "b@read.test", role: "designer" },
      { id: GUEST_USER, fullName: "Guest", email: "guest@read.test", role: "designer" },
    ])
    .onConflictDoNothing();

  await db
    .insert(requests)
    .values([
      { id: REQ_ID, orgId: WS_ID, title: "Read test request", description: "d", status: "open", createdBy: USER_A },
      { id: GUEST_REQ, orgId: WS_ID, title: "Guest request", description: "d", status: "open", createdBy: GUEST_USER },
    ])
    .onConflictDoNothing();

  await db
    .insert(notifications)
    .values([
      { id: NOTIF_A1, userId: USER_A, orgId: WS_ID, type: "request_picked_up", requestId: REQ_ID, actorId: USER_B },
      { id: NOTIF_A2, userId: USER_A, orgId: WS_ID, type: "comment_added", requestId: REQ_ID, actorId: USER_B },
      { id: NOTIF_B1, userId: USER_B, orgId: WS_ID, type: "request_done", requestId: REQ_ID, actorId: USER_A },
      { id: NOTIF_GUEST, userId: GUEST_USER, orgId: WS_ID, type: "comment_added", requestId: GUEST_REQ, actorId: USER_A },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(notifications).where(eq(notifications.orgId, WS_ID));
  await db.delete(requests).where(eq(requests.orgId, WS_ID));
  await db.delete(profiles).where(eq(profiles.id, USER_A));
  await db.delete(profiles).where(eq(profiles.id, USER_B));
  await db.delete(profiles).where(eq(profiles.id, GUEST_USER));
  await db.delete(workspaces).where(eq(workspaces.id, WS_ID));
});

describe("getNotifications — own-scoped reads", () => {
  it("user A sees only their own notifications", async () => {
    mockSession = { userId: USER_A, orgId: WS_ID, orgRole: "org:member" };
    const { getNotifications } = await import("@/app/(app)/notifications/actions");
    const result = await getNotifications({ orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    if (!("notifications" in result) || !result.notifications) throw new Error("missing notifications");
    expect(result.notifications).toHaveLength(2);
    expect(result.notifications.every((n) => n.actorName === "User B")).toBe(true);
    expect(result.notifications[0].requestTitle).toBe("Read test request");
  });

  it("user B sees only their own notifications", async () => {
    mockSession = { userId: USER_B, orgId: WS_ID, orgRole: "org:member" };
    const { getNotifications } = await import("@/app/(app)/notifications/actions");
    const result = await getNotifications({ orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    if (!("notifications" in result) || !result.notifications) throw new Error("missing notifications");
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].actorName).toBe("User A");
  });

  it("guest sees only own-request notifications", async () => {
    mockSession = { userId: GUEST_USER, orgId: WS_ID, orgRole: "org:guest" };
    const { getNotifications } = await import("@/app/(app)/notifications/actions");
    const result = await getNotifications({ orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    if (!("notifications" in result) || !result.notifications) throw new Error("missing notifications");
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].requestTitle).toBe("Guest request");
  });
});

describe("getUnreadCount", () => {
  it("returns correct unread count for user A", async () => {
    mockSession = { userId: USER_A, orgId: WS_ID, orgRole: "org:member" };
    const { getUnreadCount } = await import("@/app/(app)/notifications/actions");
    const result = await getUnreadCount({ orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    if (!("count" in result)) throw new Error("missing count");
    expect(result.count).toBe(2);
  });
});

describe("markNotificationRead — own-scoped writes", () => {
  it("user A marks own notification as read", async () => {
    mockSession = { userId: USER_A, orgId: WS_ID, orgRole: "org:member" };
    const { markNotificationRead, getUnreadCount } = await import("@/app/(app)/notifications/actions");
    const result = await markNotificationRead(NOTIF_A1, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const [row] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, NOTIF_A1));
    expect(row.readAt).not.toBeNull();

    const count = await getUnreadCount({ orgId: WS_ID });
    if (!("count" in count)) throw new Error("missing count");
    expect(count.count).toBe(1);
  });

  it("user A CANNOT mark user B's notification as read (security boundary)", async () => {
    mockSession = { userId: USER_A, orgId: WS_ID, orgRole: "org:member" };
    const { markNotificationRead } = await import("@/app/(app)/notifications/actions");
    const result = await markNotificationRead(NOTIF_B1, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const [row] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, NOTIF_B1));
    expect(row.readAt).toBeNull();
  });
});

describe("markAllNotificationsRead", () => {
  it("marks all of user A's unread notifications as read", async () => {
    mockSession = { userId: USER_A, orgId: WS_ID, orgRole: "org:member" };
    const { markAllNotificationsRead, getUnreadCount } = await import("@/app/(app)/notifications/actions");
    const result = await markAllNotificationsRead({ orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const count = await getUnreadCount({ orgId: WS_ID });
    if (!("count" in count)) throw new Error("missing count");
    expect(count.count).toBe(0);
  });

  it("markAll did NOT touch user B's notification", async () => {
    const [row] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, NOTIF_B1));
    expect(row.readAt).toBeNull();
  });

  it("markAll did NOT touch guest's notification", async () => {
    const [row] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, NOTIF_GUEST));
    expect(row.readAt).toBeNull();
  });
});

describe("markNotificationUnread — own-scoped writes", () => {
  it("user A marks own read notification as unread", async () => {
    mockSession = { userId: USER_A, orgId: WS_ID, orgRole: "org:member" };
    const { markNotificationUnread, getUnreadCount } = await import("@/app/(app)/notifications/actions");

    const [before] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, NOTIF_A1));
    expect(before.readAt).not.toBeNull();

    const result = await markNotificationUnread(NOTIF_A1, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const [after] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, NOTIF_A1));
    expect(after.readAt).toBeNull();

    const count = await getUnreadCount({ orgId: WS_ID });
    if (!("count" in count)) throw new Error("missing count");
    expect(count.count).toBe(1);
  });

  it("user A CANNOT mark user B's notification as unread (security boundary)", async () => {
    mockSession = { userId: USER_B, orgId: WS_ID, orgRole: "org:member" };
    const { markNotificationRead } = await import("@/app/(app)/notifications/actions");
    await markNotificationRead(NOTIF_B1, { orgId: WS_ID });

    const [confirm] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, NOTIF_B1));
    expect(confirm.readAt).not.toBeNull();

    mockSession = { userId: USER_A, orgId: WS_ID, orgRole: "org:member" };
    const { markNotificationUnread } = await import("@/app/(app)/notifications/actions");
    const result = await markNotificationUnread(NOTIF_B1, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const [after] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, NOTIF_B1));
    expect(after.readAt).not.toBeNull();
  });
});

describe("notification visibility after a member becomes a guest", () => {
  const downgradedUser = "00000000-0000-4000-b000-00000000f040";
  const otherWorkspace = "00000000-0000-4000-b000-00000000f002";
  const ownRequest = "00000000-0000-4000-b000-00000000f103";
  const foreignRequest = "00000000-0000-4000-b000-00000000f104";
  const ownNotification = "00000000-0000-4000-b000-00000000f205";
  const otherRequestNotification = "00000000-0000-4000-b000-00000000f206";
  const workspaceNotification = "00000000-0000-4000-b000-00000000f207";
  const mismatchedRequestNotification = "00000000-0000-4000-b000-00000000f208";
  const foreignNotification = "00000000-0000-4000-b000-00000000f209";

  beforeAll(async () => {
    await db.insert(workspaces).values({ id: otherWorkspace, name: "Other read workspace", slug: "other-read-workspace" });
    await db.insert(profiles).values({ id: downgradedUser, fullName: "Former member", email: "downgraded@read.test", role: "designer" });
    await db.insert(requests).values([
      { id: ownRequest, orgId: WS_ID, title: "Still visible", description: "d", createdBy: downgradedUser },
      { id: foreignRequest, orgId: otherWorkspace, title: "Other workspace secret", description: "d", createdBy: downgradedUser },
    ]);
    await db.insert(notifications).values([
      { id: ownNotification, userId: downgradedUser, orgId: WS_ID, type: "comment_added", requestId: ownRequest, actorId: USER_A },
      { id: otherRequestNotification, userId: downgradedUser, orgId: WS_ID, type: "comment_added", requestId: REQ_ID, actorId: USER_A },
      { id: workspaceNotification, userId: downgradedUser, orgId: WS_ID, type: "invite_accepted", requestId: null, actorId: USER_A },
      { id: mismatchedRequestNotification, userId: downgradedUser, orgId: WS_ID, type: "comment_added", requestId: foreignRequest, actorId: USER_A },
      { id: foreignNotification, userId: downgradedUser, orgId: otherWorkspace, type: "comment_added", requestId: foreignRequest, actorId: USER_A },
    ]);
  });

  beforeEach(async () => {
    mockSession = { userId: downgradedUser, orgId: WS_ID, orgRole: "org:guest" };
    await db.update(notifications).set({ readAt: null }).where(eq(notifications.userId, downgradedUser));
  });

  afterAll(async () => {
    await db.delete(notifications).where(eq(notifications.userId, downgradedUser));
    await db.delete(requests).where(eq(requests.createdBy, downgradedUser));
    await db.delete(profiles).where(eq(profiles.id, downgradedUser));
    await db.delete(workspaces).where(eq(workspaces.id, otherWorkspace));
  });

  it("members retain workspace notifications but cannot read a cross-workspace Request title", async () => {
    mockSession.orgRole = "org:member";
    const { getNotifications, getUnreadCount } = await import("@/app/(app)/notifications/actions");
    const result = await getNotifications({ orgId: WS_ID });
    if (!("notifications" in result) || !result.notifications) throw new Error("missing notifications");
    expect(result.notifications.map((row) => row.id).sort()).toEqual(
      [ownNotification, otherRequestNotification, workspaceNotification].sort()
    );
    expect(await getUnreadCount({ orgId: WS_ID })).toEqual({ success: true, count: 3 });
  });

  it("a downgrade immediately hides previous notifications about other Requests and non-Request events", async () => {
    const { getNotifications } = await import("@/app/(app)/notifications/actions");
    mockSession.orgRole = "org:member";
    const before = await getNotifications({ orgId: WS_ID });
    if (!("notifications" in before) || !before.notifications) throw new Error("missing notifications");
    expect(before.notifications.some((row) => row.id === otherRequestNotification)).toBe(true);

    mockSession.orgRole = "org:guest";
    const after = await getNotifications({ orgId: WS_ID });
    if (!("notifications" in after) || !after.notifications) throw new Error("missing notifications");
    expect(after.notifications.map((row) => ({ id: row.id, title: row.requestTitle }))).toEqual([
      { id: ownNotification, title: "Still visible" },
    ]);
  });

  it("the guest unread count includes only currently visible Requests", async () => {
    const { getUnreadCount } = await import("@/app/(app)/notifications/actions");
    expect(await getUnreadCount({ orgId: WS_ID })).toEqual({ success: true, count: 1 });
  });

  it("mark-read does not mutate a hidden notification even when its id is known", async () => {
    const { markNotificationRead } = await import("@/app/(app)/notifications/actions");
    for (const id of [ownNotification, otherRequestNotification, workspaceNotification, mismatchedRequestNotification, foreignNotification]) {
      await markNotificationRead(id, { orgId: WS_ID });
    }
    const rows = await db.select().from(notifications).where(eq(notifications.userId, downgradedUser));
    expect(rows.filter((row) => row.readAt !== null).map((row) => row.id)).toEqual([ownNotification]);
  });

  it("mark-unread does not mutate hidden notifications", async () => {
    await db.update(notifications).set({ readAt: new Date("2026-09-28T00:00:00Z") }).where(eq(notifications.userId, downgradedUser));
    const { markNotificationUnread } = await import("@/app/(app)/notifications/actions");
    for (const id of [ownNotification, otherRequestNotification, workspaceNotification, mismatchedRequestNotification, foreignNotification]) {
      await markNotificationUnread(id, { orgId: WS_ID });
    }
    const rows = await db.select().from(notifications).where(eq(notifications.userId, downgradedUser));
    expect(rows.filter((row) => row.readAt === null).map((row) => row.id)).toEqual([ownNotification]);
  });

  it("mark-all-read mutates exactly the guest-visible notifications", async () => {
    const { markAllNotificationsRead, getUnreadCount } = await import("@/app/(app)/notifications/actions");
    await markAllNotificationsRead({ orgId: WS_ID });
    const rows = await db.select().from(notifications).where(eq(notifications.userId, downgradedUser));
    expect(rows.filter((row) => row.readAt !== null).map((row) => row.id)).toEqual([ownNotification]);
    expect(await getUnreadCount({ orgId: WS_ID })).toEqual({ success: true, count: 0 });
  });
});
