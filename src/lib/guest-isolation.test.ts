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
import { db, workspaceMembers, requests, profiles } from "@/db";
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

const WORKSPACE_A = "e9e3b28e-f594-4ae1-85d9-bc85e66b5a19";
const USER_A_OWNER = "7c683bdd-43ce-42c4-847a-3fb5663b2926";
const GUEST_USER = "00000000-0000-4000-a000-000000000099";
const REQUEST_A_OPEN = "de7fe180-b51b-4714-8e82-42b775fe53d4";

let originalRequestStatus: string;
let originalRequestAssignee: string | null;

beforeAll(async () => {
  await db
    .insert(profiles)
    .values({
      id: GUEST_USER,
      orgId: WORKSPACE_A,
      fullName: "Test Guest",
      email: "test-guest@forge.test",
      role: "designer",
    })
    .onConflictDoNothing();

  await db
    .insert(workspaceMembers)
    .values({
      workspaceId: WORKSPACE_A,
      userId: GUEST_USER,
      role: "guest",
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [workspaceMembers.workspaceId, workspaceMembers.userId],
      set: { role: "guest", isActive: true },
    });

  const [req] = await db
    .select({ status: requests.status, assignedTo: requests.assignedTo })
    .from(requests)
    .where(eq(requests.id, REQUEST_A_OPEN));
  originalRequestStatus = req?.status ?? "open";
  originalRequestAssignee = req?.assignedTo ?? null;

  if (originalRequestStatus !== "open") {
    await db
      .update(requests)
      .set({ status: "open", assignedTo: null })
      .where(eq(requests.id, REQUEST_A_OPEN));
  }
});

afterAll(async () => {
  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, WORKSPACE_A),
        eq(workspaceMembers.userId, GUEST_USER)
      )
    );

  await db.delete(profiles).where(eq(profiles.id, GUEST_USER));

  await db
    .update(requests)
    .set({ status: originalRequestStatus as any, assignedTo: originalRequestAssignee })
    .where(eq(requests.id, REQUEST_A_OPEN));
});

describe("Guest blocked from management actions", () => {
  it("guest → pickUpRequest → REJECTED", async () => {
    mockSessionUser = { id: GUEST_USER };
    const { pickUpRequest } = await import(
      "@/app/(app)/requests/[id]/actions"
    );
    const result = await pickUpRequest(REQUEST_A_OPEN, {
      orgId: WORKSPACE_A,
    });
    expect(result).toHaveProperty("error");
    expect((result as any).success).toBeUndefined();
  });

  it("guest → markDone → REJECTED", async () => {
    mockSessionUser = { id: GUEST_USER };
    const { markDone } = await import("@/app/(app)/requests/[id]/actions");
    const result = await markDone(REQUEST_A_OPEN, { orgId: WORKSPACE_A });
    expect(result).toHaveProperty("error");
    expect((result as any).success).toBeUndefined();
  });
});

describe("Guest CAN still submit (requireActiveMember passes)", () => {
  it("guest → addComment → ALLOWED (requireActiveMember passes guests)", async () => {
    mockSessionUser = { id: GUEST_USER };
    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const formData = new FormData();
    formData.set("body", "guest isolation probe — should succeed");
    const result = await addComment(REQUEST_A_OPEN, formData, {
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
  afterAll(async () => {
    await db
      .update(requests)
      .set({ status: "open", assignedTo: null })
      .where(eq(requests.id, REQUEST_A_OPEN));
  });

  it("owner → pickUpRequest → ALLOWED", async () => {
    mockSessionUser = { id: USER_A_OWNER };
    const { pickUpRequest } = await import(
      "@/app/(app)/requests/[id]/actions"
    );
    const result = await pickUpRequest(REQUEST_A_OPEN, {
      orgId: WORKSPACE_A,
    });
    expect(result).toHaveProperty("success", true);
  });

  it("owner → markDone → ALLOWED", async () => {
    mockSessionUser = { id: USER_A_OWNER };
    const { markDone } = await import("@/app/(app)/requests/[id]/actions");
    const result = await markDone(REQUEST_A_OPEN, { orgId: WORKSPACE_A });
    expect(result).toHaveProperty("success", true);
  });
});
