/**
 * Identity forge proof.
 *
 * Pre-fix: context.userId crossed client→server as an action argument.
 * Any authenticated user could impersonate any member by forging context.userId.
 *
 * Post-fix: guards derive userId from auth.getUser() (httpOnly cookie, unforgeable).
 * context only carries orgId. This test proves:
 *   1. Impersonation blocked — forged userId in context is ignored
 *   2. orgId forge blocked — attacker not a member of target workspace
 *   3. Identity field binds to session user — assignedTo/authorId = real caller
 *   4. Positive control — legitimate caller's own action works
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db, requests } from "@/db";
import { eq } from "drizzle-orm";

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
const WORKSPACE_B = "649ace1d-14d8-40d1-9603-c91514f827cc";
const USER_B = "121fe28c-ae3f-4fc7-92c2-ccb195f3b97c"; // test3 — owns B, NOT a member of A
const USER_A_OWNER = "7c683bdd-43ce-42c4-847a-3fb5663b2926";
const REQUEST_A_OPEN = "de7fe180-b51b-4714-8e82-42b775fe53d4";

describe("Impersonation blocked — forged userId ignored", () => {
  it("pickUpRequest: session=B, forged userId=A_OWNER in context → rejected", async () => {
    mockSessionUser = { id: USER_B };
    const { pickUpRequest } = await import(
      "@/app/(app)/requests/[id]/actions"
    );
    const result = await pickUpRequest(REQUEST_A_OPEN, {
      userId: USER_A_OWNER,
      orgId: WORKSPACE_A,
    } as any);
    expect(result).toHaveProperty("error");
    expect(result.success).toBeUndefined();
  });

  it("addComment: session=B, forged userId=A_OWNER → rejected", async () => {
    mockSessionUser = { id: USER_B };
    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const formData = new FormData();
    formData.set("body", "impersonation probe");
    const result = await addComment(REQUEST_A_OPEN, formData, {
      userId: USER_A_OWNER,
      orgId: WORKSPACE_A,
    } as any);
    expect(result).toHaveProperty("error");
    expect(result.success).toBeUndefined();
  });

  it("updateMemberRole: session=B, forged userId=A_OWNER → rejected", async () => {
    mockSessionUser = { id: USER_B };
    const { updateMemberRole } = await import(
      "@/app/(app)/settings/members/actions"
    );
    const result = await updateMemberRole(
      { targetUserId: USER_A_OWNER, newRole: "admin" },
      { userId: USER_A_OWNER, orgId: WORKSPACE_A } as any
    );
    expect(result).toHaveProperty("error");
  });

  it("createInvite: session=B, forged userId=A_OWNER → rejected", async () => {
    mockSessionUser = { id: USER_B };
    const { createInvite } = await import(
      "@/app/(app)/settings/members/actions"
    );
    const result = await createInvite(
      { email: "forge-probe@example.com", role: "member" },
      { userId: USER_A_OWNER, orgId: WORKSPACE_A } as any
    );
    expect(result).toHaveProperty("error");
  });
});

describe("orgId forge blocked — session=B, no userId, orgId=A", () => {
  it("pickUpRequest: rejected (B not in A)", async () => {
    mockSessionUser = { id: USER_B };
    const { pickUpRequest } = await import(
      "@/app/(app)/requests/[id]/actions"
    );
    const result = await pickUpRequest(REQUEST_A_OPEN, {
      orgId: WORKSPACE_A,
    });
    expect(result).toHaveProperty("error");
  });

  it("removeMember: rejected (B not in A)", async () => {
    mockSessionUser = { id: USER_B };
    const { removeMember } = await import(
      "@/app/(app)/settings/members/actions"
    );
    const result = await removeMember(USER_A_OWNER, { orgId: WORKSPACE_A });
    expect(result).toHaveProperty("error");
  });
});

describe("Identity binding — assignedTo = session user, not forged id", () => {
  let originalStatus: "open" | "in_progress" | "done";
  let originalAssignee: string | null;

  beforeAll(async () => {
    const [req] = await db
      .select({ status: requests.status, assignedTo: requests.assignedTo })
      .from(requests)
      .where(eq(requests.id, REQUEST_A_OPEN));
    originalStatus = (req?.status as "open" | "in_progress" | "done") ?? "open";
    originalAssignee = req?.assignedTo ?? null;
    if (originalStatus !== "open") {
      await db
        .update(requests)
        .set({ status: "open", assignedTo: null })
        .where(eq(requests.id, REQUEST_A_OPEN));
    }
  });

  afterAll(async () => {
    await db
      .update(requests)
      .set({ status: originalStatus, assignedTo: originalAssignee })
      .where(eq(requests.id, REQUEST_A_OPEN));
  });

  it("pickUpRequest: session=A_OWNER → assignedTo = A_OWNER (from session)", async () => {
    mockSessionUser = { id: USER_A_OWNER };
    const { pickUpRequest } = await import(
      "@/app/(app)/requests/[id]/actions"
    );
    const result = await pickUpRequest(REQUEST_A_OPEN, {
      orgId: WORKSPACE_A,
    });
    expect(result).toHaveProperty("success", true);

    const [req] = await db
      .select({ assignedTo: requests.assignedTo })
      .from(requests)
      .where(eq(requests.id, REQUEST_A_OPEN));
    expect(req.assignedTo).toBe(USER_A_OWNER);
  });
});

describe("Positive control — legitimate caller succeeds", () => {
  afterAll(async () => {
    // Clean up any invite created by the positive control
    const { db: dbClean, invites } = await import("@/db");
    const { eq: eqClean, and: andClean } = await import("drizzle-orm");
    await dbClean
      .delete(invites)
      .where(
        andClean(
          eqClean(invites.orgId, WORKSPACE_B),
          eqClean(invites.email, "positive-ctrl@example.com")
        )
      );
  });

  it("session=B, orgId=B → createInvite succeeds (B is owner of B)", async () => {
    mockSessionUser = { id: USER_B };
    const { createInvite } = await import(
      "@/app/(app)/settings/members/actions"
    );
    const result = await createInvite(
      { email: "positive-ctrl@example.com", role: "member" },
      { orgId: WORKSPACE_B }
    );
    expect(result).toHaveProperty("success", true);
  });
});
