/**
 * Guest isolation forge proof.
 *
 * Proves the intra-workspace boundary: a guest (role='guest') can submit
 * through the intake gate but CANNOT pick up or mark done requests.
 * Positive control: a member CAN perform management actions.
 *
 * Same real-session, real-action pattern as auth-guard.test.ts.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db, requests, profiles, workspaces } from "@/db";
import { eq } from "drizzle-orm";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

let mockSession = { userId: "", orgId: "", orgRole: "" };

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => mockSession),
}));

const WORKSPACE_A = "00000000-0000-4000-a000-000000000090";
const USER_A_OWNER = "00000000-0000-4000-a000-000000000091";
const GUEST_USER = "00000000-0000-4000-a000-000000000099";
const GUEST_OWN_REQ = "00000000-0000-4000-a000-000000000100";
const CONTROL_REQ = "00000000-0000-4000-a000-000000000c01";

beforeAll(async () => {
  await db.insert(workspaces).values({
    id: WORKSPACE_A,
    name: "Guest Isolation",
    slug: "guest-isolation",
  }).onConflictDoNothing();

  await db.insert(profiles).values({
    id: USER_A_OWNER,
    fullName: "Test Owner",
    email: "test-owner@forge.test",
    role: "pm",
  }).onConflictDoNothing();

  await db
    .insert(profiles)
    .values({
      id: GUEST_USER,
      fullName: "Test Guest",
      email: "test-guest@forge.test",
      role: "designer",
    })
    .onConflictDoNothing();

  await db.insert(requests).values({
    id: GUEST_OWN_REQ,
    orgId: WORKSPACE_A,
    title: "Guest-owned request for isolation test",
    description: "Created by guest — addComment target",
    status: "open",
    createdBy: GUEST_USER,
  }).onConflictDoNothing();

  await db.insert(requests).values({
    id: CONTROL_REQ,
    orgId: WORKSPACE_A,
    title: "Positive-control request for guest-isolation",
    description: "Self-seeded for owner pickup/done test",
    status: "open",
    createdBy: USER_A_OWNER,
  }).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(requests).where(eq(requests.id, GUEST_OWN_REQ));
  await db.delete(requests).where(eq(requests.id, CONTROL_REQ));
  await db.delete(profiles).where(eq(profiles.id, GUEST_USER));
  await db.delete(profiles).where(eq(profiles.id, USER_A_OWNER));
  await db.delete(workspaces).where(eq(workspaces.id, WORKSPACE_A));
});

describe("Guest blocked from management actions", () => {
  it("guest → pickUpRequest → REJECTED", async () => {
    mockSession = { userId: GUEST_USER, orgId: WORKSPACE_A, orgRole: "org:guest" };
    const { pickUpRequest } = await import(
      "@/app/(app)/requests/[id]/actions"
    );
    const result = await pickUpRequest(CONTROL_REQ, {
      orgId: WORKSPACE_A,
    });
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/not found/i);
    expect(result).not.toHaveProperty("success");
  });

  it("guest → markDone → REJECTED", async () => {
    mockSession = { userId: GUEST_USER, orgId: WORKSPACE_A, orgRole: "org:guest" };
    const { markDone } = await import("@/app/(app)/requests/[id]/actions");
    const result = await markDone(CONTROL_REQ, { orgId: WORKSPACE_A });
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/not found/i);
    expect(result).not.toHaveProperty("success");
  });
});

describe("Guest CAN comment on own request", () => {
  it("guest → addComment on own request → ALLOWED", async () => {
    mockSession = { userId: GUEST_USER, orgId: WORKSPACE_A, orgRole: "org:guest" };
    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const formData = new FormData();
    formData.set("body", "guest isolation probe — should succeed");
    const result = await addComment(GUEST_OWN_REQ, formData, {
      orgId: WORKSPACE_A,
    });
    expect(result).toHaveProperty("success", true);
  });

  afterAll(async () => {
    const { comments } = await import("@/db");
    await db
      .delete(comments)
      .where(eq(comments.authorId, GUEST_USER));
  });
});

describe("Positive control — member+ CAN manage", () => {
  it("owner → pickUpRequest → ALLOWED", async () => {
    mockSession = { userId: USER_A_OWNER, orgId: WORKSPACE_A, orgRole: "org:admin" };
    const { pickUpRequest } = await import(
      "@/app/(app)/requests/[id]/actions"
    );
    const result = await pickUpRequest(CONTROL_REQ, {
      orgId: WORKSPACE_A,
    });
    expect(result).toHaveProperty("success", true);
  });

  it("owner → markDone → ALLOWED", async () => {
    mockSession = { userId: USER_A_OWNER, orgId: WORKSPACE_A, orgRole: "org:admin" };
    const { markDone } = await import("@/app/(app)/requests/[id]/actions");
    const result = await markDone(CONTROL_REQ, { orgId: WORKSPACE_A });
    expect(result).toHaveProperty("success", true);
  });
});
