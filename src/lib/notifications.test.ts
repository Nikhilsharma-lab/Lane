/**
 * Notification creation forge proof.
 *
 * Proves the four lifecycle hooks create notification rows for the
 * correct recipient(s), with the correct type and actor, and NEVER
 * self-notify the actor. Uses real DB via Drizzle, mocked Supabase auth.
 *
 * ISOLATION: seeds its OWN workspace, profiles, members, requests.
 * Does NOT touch any row another test file uses.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  db,
  workspaces,
  profiles,
  requests,
  notifications,
  comments,
} from "@/db";
import { eq, and } from "drizzle-orm";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let mockSession = { userId: "", orgId: "", orgRole: "" };

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => mockSession),
}));

// Unique UUIDs for this test file (0xF0xx range)
const WS_ID = "00000000-0000-4000-a000-00000000f001";
const REQUESTER_ID = "00000000-0000-4000-a000-00000000f010";
const PICKER_ID = "00000000-0000-4000-a000-00000000f020";
const THIRD_PARTY_ID = "00000000-0000-4000-a000-00000000f030";
const GUEST_ID = "00000000-0000-4000-a000-00000000f040";

const REQ_PICKUP = "00000000-0000-4000-a000-00000000f101";
const REQ_DONE = "00000000-0000-4000-a000-00000000f102";
const REQ_COMMENT = "00000000-0000-4000-a000-00000000f103";
const REQ_SELF = "00000000-0000-4000-a000-00000000f104";
const REQ_BOTH = "00000000-0000-4000-a000-00000000f105";
const REQ_GUEST = "00000000-0000-4000-a000-00000000f106";

beforeAll(async () => {
  await db
    .insert(workspaces)
    .values({ id: WS_ID, name: "Notify Test WS", slug: "notify-test-ws" })
    .onConflictDoNothing();

  await db
    .insert(profiles)
    .values([
      { id: REQUESTER_ID, fullName: "Requester", email: "requester@notify.test", role: "pm" },
      { id: PICKER_ID, fullName: "Picker", email: "picker@notify.test", role: "designer" },
      { id: THIRD_PARTY_ID, fullName: "Third Party", email: "third@notify.test", role: "developer" },
      { id: GUEST_ID, fullName: "Guest User", email: "guest@notify.test", role: "designer" },
    ])
    .onConflictDoNothing();

  await db
    .insert(requests)
    .values([
      { id: REQ_PICKUP, orgId: WS_ID, title: "Pickup test", description: "d", status: "open", createdBy: REQUESTER_ID },
      { id: REQ_DONE, orgId: WS_ID, title: "Done test", description: "d", status: "in_progress", assignedTo: PICKER_ID, createdBy: REQUESTER_ID },
      { id: REQ_COMMENT, orgId: WS_ID, title: "Comment test", description: "d", status: "in_progress", assignedTo: PICKER_ID, createdBy: REQUESTER_ID },
      { id: REQ_SELF, orgId: WS_ID, title: "Self-notify test", description: "d", status: "open", createdBy: PICKER_ID },
      { id: REQ_BOTH, orgId: WS_ID, title: "Both-notify test", description: "d", status: "in_progress", assignedTo: PICKER_ID, createdBy: REQUESTER_ID },
      { id: REQ_GUEST, orgId: WS_ID, title: "Guest comment test", description: "d", status: "in_progress", assignedTo: PICKER_ID, createdBy: GUEST_ID },
    ])
    .onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(notifications).where(eq(notifications.orgId, WS_ID));
  await db.delete(comments).where(
    eq(comments.requestId, REQ_COMMENT)
  );
  await db.delete(comments).where(
    eq(comments.requestId, REQ_SELF)
  );
  await db.delete(comments).where(
    eq(comments.requestId, REQ_BOTH)
  );
  await db.delete(comments).where(
    eq(comments.requestId, REQ_GUEST)
  );
  await db.delete(requests).where(eq(requests.orgId, WS_ID));
  await db.delete(profiles).where(eq(profiles.id, REQUESTER_ID));
  await db.delete(profiles).where(eq(profiles.id, PICKER_ID));
  await db.delete(profiles).where(eq(profiles.id, THIRD_PARTY_ID));
  await db.delete(profiles).where(eq(profiles.id, GUEST_ID));
  await db.delete(workspaces).where(eq(workspaces.id, WS_ID));
});

async function getNotifications(requestId: string | null) {
  if (requestId) {
    return db
      .select()
      .from(notifications)
      .where(
        and(eq(notifications.orgId, WS_ID), eq(notifications.requestId, requestId))
      );
  }
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.orgId, WS_ID));
}

describe("pickUpRequest → notification", () => {
  it("notifies the requester when someone picks up their request", async () => {
    mockSession = { userId: PICKER_ID, orgId: WS_ID, orgRole: "org:member" };
    const { pickUpRequest } = await import("@/app/(app)/requests/[id]/actions");
    const result = await pickUpRequest(REQ_PICKUP, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const rows = await getNotifications(REQ_PICKUP);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(REQUESTER_ID);
    expect(rows[0].actorId).toBe(PICKER_ID);
    expect(rows[0].type).toBe("request_picked_up");
    expect(rows[0].readAt).toBeNull();
  });

  it("does NOT self-notify when requester picks up own request", async () => {
    mockSession = { userId: PICKER_ID, orgId: WS_ID, orgRole: "org:member" };
    const { pickUpRequest } = await import("@/app/(app)/requests/[id]/actions");
    const result = await pickUpRequest(REQ_SELF, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const rows = await getNotifications(REQ_SELF);
    expect(rows).toHaveLength(0);
  });
});

describe("markDone → notification", () => {
  it("notifies the requester when their request is marked done", async () => {
    mockSession = { userId: PICKER_ID, orgId: WS_ID, orgRole: "org:member" };
    const { markDone } = await import("@/app/(app)/requests/[id]/actions");
    const result = await markDone(REQ_DONE, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const rows = await getNotifications(REQ_DONE);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(REQUESTER_ID);
    expect(rows[0].actorId).toBe(PICKER_ID);
    expect(rows[0].type).toBe("request_done");
  });
});

describe("addComment → notification", () => {
  it("requester comments → notifies assignee", async () => {
    mockSession = { userId: REQUESTER_ID, orgId: WS_ID, orgRole: "org:member" };
    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const formData = new FormData();
    formData.set("body", "requester comment");
    const result = await addComment(REQ_COMMENT, formData, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const rows = await getNotifications(REQ_COMMENT);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(PICKER_ID);
    expect(rows[0].actorId).toBe(REQUESTER_ID);
    expect(rows[0].type).toBe("comment_added");
  });

  it("assignee comments → notifies requester", async () => {
    mockSession = { userId: PICKER_ID, orgId: WS_ID, orgRole: "org:member" };
    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const formData = new FormData();
    formData.set("body", "assignee comment");
    const result = await addComment(REQ_COMMENT, formData, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const rows = await getNotifications(REQ_COMMENT);
    const assigneeCommentRows = rows.filter((r) => r.actorId === PICKER_ID);
    expect(assigneeCommentRows).toHaveLength(1);
    expect(assigneeCommentRows[0].userId).toBe(REQUESTER_ID);
  });

  it("third party comments → notifies BOTH requester and assignee", async () => {
    mockSession = { userId: THIRD_PARTY_ID, orgId: WS_ID, orgRole: "org:member" };
    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const formData = new FormData();
    formData.set("body", "third party comment");
    const result = await addComment(REQ_BOTH, formData, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const rows = await getNotifications(REQ_BOTH);
    expect(rows).toHaveLength(2);
    const recipientIds = rows.map((r) => r.userId).sort();
    expect(recipientIds).toEqual([REQUESTER_ID, PICKER_ID].sort());
    expect(rows.every((r) => r.actorId === THIRD_PARTY_ID)).toBe(true);
  });

  it("guest comments on own request → notifies assignee", async () => {
    mockSession = { userId: GUEST_ID, orgId: WS_ID, orgRole: "org:guest" };
    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const formData = new FormData();
    formData.set("body", "guest comment");
    const result = await addComment(REQ_GUEST, formData, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const rows = await getNotifications(REQ_GUEST);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(PICKER_ID);
    expect(rows[0].actorId).toBe(GUEST_ID);
  });

  it("third party comments where createdBy === assignedTo → notifies that person", async () => {
    // REQ_SELF: createdBy=PICKER_ID, picked up by PICKER_ID in earlier test.
    // Commenter=REQUESTER_ID (neither party) → "both" branch fires for PICKER_ID.
    mockSession = { userId: REQUESTER_ID, orgId: WS_ID, orgRole: "org:member" };
    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const formData = new FormData();
    formData.set("body", "comment on self-assigned request");
    const result = await addComment(REQ_SELF, formData, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);

    const rows = await getNotifications(REQ_SELF);
    const commentRows = rows.filter(
      (r) => r.type === "comment_added" && r.actorId === REQUESTER_ID
    );
    expect(commentRows.length).toBeGreaterThanOrEqual(1);
    expect(commentRows.every((r) => r.userId === PICKER_ID)).toBe(true);
  });
});
