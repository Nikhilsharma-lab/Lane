/**
 * Guest comment own-scoping forge proof.
 *
 * Proves the write boundary: a guest can addComment only on requests
 * they created; forging another request's id is rejected 404-style.
 * Positive control: a member comments on the guest's request.
 *
 * ISOLATION: seeds its OWN workspace, profiles, members, requests.
 * Does NOT touch any row another test file uses.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db, workspaceMembers, requests, profiles, workspaces, comments } from "@/db";
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

const WS_ID = "00000000-0000-4000-c000-000000000001";
const GUEST_ID = "00000000-0000-4000-c000-000000000010";
const MEMBER_ID = "00000000-0000-4000-c000-000000000020";
const GUEST_REQ_ID = "00000000-0000-4000-c000-000000000100";
const MEMBER_REQ_ID = "00000000-0000-4000-c000-000000000200";

beforeAll(async () => {
  await db.insert(workspaces).values({
    id: WS_ID,
    name: "Comment-Scoping Test WS",
    slug: "comment-scoping-test-ws",
  }).onConflictDoNothing();

  await db.insert(profiles).values([
    { id: GUEST_ID, orgId: WS_ID, fullName: "Comment Guest", email: "guest-comment@forge.test", role: "designer" },
    { id: MEMBER_ID, orgId: WS_ID, fullName: "Comment Member", email: "member-comment@forge.test", role: "developer" },
  ]).onConflictDoNothing();

  await db.insert(workspaceMembers).values([
    { workspaceId: WS_ID, userId: GUEST_ID, role: "guest", isActive: true },
    { workspaceId: WS_ID, userId: MEMBER_ID, role: "member", isActive: true },
  ]).onConflictDoNothing();

  await db.insert(requests).values([
    {
      id: GUEST_REQ_ID,
      orgId: WS_ID,
      title: "Guest's request for comment test",
      description: "Created by the guest",
      status: "open",
      createdBy: GUEST_ID,
    },
    {
      id: MEMBER_REQ_ID,
      orgId: WS_ID,
      title: "Member's request for comment test",
      description: "Created by the member — guest must not comment here",
      status: "open",
      createdBy: MEMBER_ID,
    },
  ]).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(comments).where(
    eq(comments.requestId, GUEST_REQ_ID)
  );
  await db.delete(comments).where(
    eq(comments.requestId, MEMBER_REQ_ID)
  );
  await db.delete(requests).where(eq(requests.orgId, WS_ID));
  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, WS_ID));
  await db.delete(profiles).where(eq(profiles.orgId, WS_ID));
  await db.delete(workspaces).where(eq(workspaces.id, WS_ID));
});

function formData(body: string): FormData {
  const fd = new FormData();
  fd.set("body", body);
  return fd;
}

describe("Guest comment own-scoping", () => {
  it("guest addComment on own request → allowed", async () => {
    mockSessionUser = { id: GUEST_ID };

    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const result = await addComment(GUEST_REQ_ID, formData("guest's own comment"), { orgId: WS_ID });

    expect(result).toHaveProperty("success", true);

    const [row] = await db
      .select({ authorId: comments.authorId, body: comments.body })
      .from(comments)
      .where(and(eq(comments.requestId, GUEST_REQ_ID), eq(comments.authorId, GUEST_ID)));
    expect(row).toBeDefined();
    expect(row.body).toBe("guest's own comment");
  });

  it("guest addComment on member's request (forged id) → rejected", async () => {
    mockSessionUser = { id: GUEST_ID };

    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const result = await addComment(MEMBER_REQ_ID, formData("sneaky comment"), { orgId: WS_ID });

    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/not found/i);

    const rows = await db
      .select({ id: comments.id })
      .from(comments)
      .where(and(eq(comments.requestId, MEMBER_REQ_ID), eq(comments.authorId, GUEST_ID)));
    expect(rows).toHaveLength(0);
  });

  it("member addComment on guest's request → allowed (positive control)", async () => {
    mockSessionUser = { id: MEMBER_ID };

    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const result = await addComment(GUEST_REQ_ID, formData("member's comment on guest request"), { orgId: WS_ID });

    expect(result).toHaveProperty("success", true);

    const rows = await db
      .select({ authorId: comments.authorId, body: comments.body })
      .from(comments)
      .where(eq(comments.requestId, GUEST_REQ_ID));

    const memberComment = rows.find(r => r.authorId === MEMBER_ID);
    expect(memberComment).toBeDefined();
    expect(memberComment!.body).toBe("member's comment on guest request");

    const guestComment = rows.find(r => r.authorId === GUEST_ID);
    expect(guestComment).toBeDefined();
    expect(guestComment!.body).toBe("guest's own comment");
  });
});
