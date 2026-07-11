/**
 * Cross-workspace RLS isolation test.
 *
 * Workspace A (owner's): e9e3b28e — has requests, comments, members.
 * Workspace B (test3's): 649ace1d — separate user, NO membership in A.
 *
 * Guards derive userId from the session (auth.getUser), so the mock session
 * controls which user the action sees. Every test sets session = USER_B and
 * passes orgId = WORKSPACE_A. A single success is a critical isolation failure.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

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
const USER_B = "121fe28c-ae3f-4fc7-92c2-ccb195f3b97c"; // test3
const USER_A_OWNER = "7c683bdd-43ce-42c4-847a-3fb5663b2926";
const USER_A_MEMBER = "b0784525-9e27-46c7-9bdd-066ceb776674";
const REQUEST_A_OPEN = "de7fe180-b51b-4714-8e82-42b775fe53d4";
const COMMENT_A = "f76914f7-4726-4fcf-97b5-f8d5031723f4";

describe("Cross-workspace isolation — forged actions", () => {
  beforeAll(() => {
    mockSessionUser = { id: USER_B };
  });

  it("pickUpRequest: B cannot pick up A's request with forged orgId", async () => {
    const { pickUpRequest } = await import(
      "@/app/(app)/requests/[id]/actions"
    );
    const result = await pickUpRequest(REQUEST_A_OPEN, {
      orgId: WORKSPACE_A,
    });
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/not found/i);
    expect(result.success).toBeUndefined();
  });

  it("addComment: B cannot comment on A's request with forged orgId", async () => {
    const { addComment } = await import("@/app/(app)/requests/[id]/actions");
    const formData = new FormData();
    formData.set("body", "cross-workspace probe");
    const result = await addComment(REQUEST_A_OPEN, formData, {
      orgId: WORKSPACE_A,
    });
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/not found/i);
    expect(result.success).toBeUndefined();
  });

  it("updateMemberRole: B cannot change A's member role with forged orgId", async () => {
    const { updateMemberRole } = await import(
      "@/app/(app)/settings/members/actions"
    );
    const result = await updateMemberRole(
      { targetUserId: USER_A_MEMBER, newRole: "admin" },
      { orgId: WORKSPACE_A }
    );
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/only owners and admins can change roles/i);
    expect(result.success).toBeUndefined();
  });

  it("removeMember: B cannot remove A's member with forged orgId", async () => {
    const { removeMember } = await import(
      "@/app/(app)/settings/members/actions"
    );
    const result = await removeMember(USER_A_MEMBER, {
      orgId: WORKSPACE_A,
    });
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/only owners and admins can remove members/i);
    expect(result.success).toBeUndefined();
  });

  it("createInvite: B cannot create invite in A's workspace with forged orgId", async () => {
    const { createInvite } = await import(
      "@/app/(app)/settings/members/actions"
    );
    const result = await createInvite(
      { email: "probe@example.com", role: "member" },
      { orgId: WORKSPACE_A }
    );
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/only owners and admins can invite members/i);
    expect(result.success).toBeUndefined();
  });
});
