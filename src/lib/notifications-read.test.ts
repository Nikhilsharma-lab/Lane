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
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  db,
  workspaces,
  profiles,
  workspaceMembers,
  requests,
  notifications,
} from "@/db";
import { eq, and } from "drizzle-orm";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let mockSessionUser: { id: string; email?: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockSessionUser },
        error: mockSessionUser ? null : { message: "Not authenticated" },
      }),
    },
  })),
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
      { id: USER_A, orgId: WS_ID, fullName: "User A", email: "a@read.test", role: "pm" },
      { id: USER_B, orgId: WS_ID, fullName: "User B", email: "b@read.test", role: "designer" },
      { id: GUEST_USER, orgId: WS_ID, fullName: "Guest", email: "guest@read.test", role: "designer" },
    ])
    .onConflictDoNothing();

  await db
    .insert(workspaceMembers)
    .values([
      { workspaceId: WS_ID, userId: USER_A, role: "member", isActive: true },
      { workspaceId: WS_ID, userId: USER_B, role: "member", isActive: true },
      { workspaceId: WS_ID, userId: GUEST_USER, role: "guest", isActive: true },
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
  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, WS_ID));
  await db.delete(profiles).where(eq(profiles.orgId, WS_ID));
  await db.delete(workspaces).where(eq(workspaces.id, WS_ID));
});

describe("getNotifications — own-scoped reads", () => {
  it("user A sees only their own notifications", async () => {
    mockSessionUser = { id: USER_A };
    const { getNotifications } = await import("@/app/(app)/notifications/actions");
    const result = await getNotifications({ orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    if (!("notifications" in result)) throw new Error("missing notifications");
    expect(result.notifications).toHaveLength(2);
    expect(result.notifications.every((n) => n.actorName === "User B")).toBe(true);
    expect(result.notifications[0].requestTitle).toBe("Read test request");
  });

  it("user B sees only their own notifications", async () => {
    mockSessionUser = { id: USER_B };
    const { getNotifications } = await import("@/app/(app)/notifications/actions");
    const result = await getNotifications({ orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    if (!("notifications" in result)) throw new Error("missing notifications");
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].actorName).toBe("User A");
  });

  it("guest sees only own-request notifications", async () => {
    mockSessionUser = { id: GUEST_USER };
    const { getNotifications } = await import("@/app/(app)/notifications/actions");
    const result = await getNotifications({ orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    if (!("notifications" in result)) throw new Error("missing notifications");
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].requestTitle).toBe("Guest request");
  });
});

describe("getUnreadCount", () => {
  it("returns correct unread count for user A", async () => {
    mockSessionUser = { id: USER_A };
    const { getUnreadCount } = await import("@/app/(app)/notifications/actions");
    const result = await getUnreadCount({ orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    if (!("count" in result)) throw new Error("missing count");
    expect(result.count).toBe(2);
  });
});

describe("markNotificationRead — own-scoped writes", () => {
  it("user A marks own notification as read", async () => {
    mockSessionUser = { id: USER_A };
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
    mockSessionUser = { id: USER_A };
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
    mockSessionUser = { id: USER_A };
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
    mockSessionUser = { id: USER_A };
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
    mockSessionUser = { id: USER_B };
    const { markNotificationRead } = await import("@/app/(app)/notifications/actions");
    await markNotificationRead(NOTIF_B1, { orgId: WS_ID });

    const [confirm] = await db
      .select({ readAt: notifications.readAt })
      .from(notifications)
      .where(eq(notifications.id, NOTIF_B1));
    expect(confirm.readAt).not.toBeNull();

    mockSessionUser = { id: USER_A };
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
