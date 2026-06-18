import { describe, it, expect, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

import { updateMemberRole, removeMember, createInvite } from "./actions";

const OWNER_ID = "7c683bdd-43ce-42c4-847a-3fb5663b2926";
const MEMBER_ID = "b0784525-9e27-46c7-9bdd-066ceb776674";
const ORG_ID = "e9e3b28e-f594-4ae1-85d9-bc85e66b5a19";

const ownerCtx = { userId: OWNER_ID, orgId: ORG_ID };
const memberCtx = { userId: MEMBER_ID, orgId: ORG_ID };

describe("forged-call permission tests (real actions, real DB)", () => {
  it("2a: self-role-change is blocked", async () => {
    mockSessionUser = { id: OWNER_ID };
    const result = await updateMemberRole(
      { targetUserId: OWNER_ID, newRole: "admin" },
      ownerCtx
    );
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/cannot change your own role/i);
  });

  it("2b: removing the owner is blocked", async () => {
    mockSessionUser = { id: OWNER_ID };
    const result = await removeMember(OWNER_ID, ownerCtx);
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/cannot remove yourself/i);
  });

  it("2b-alt: member cannot remove the owner", async () => {
    mockSessionUser = { id: MEMBER_ID };
    const result = await removeMember(OWNER_ID, memberCtx);
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/only owners and admins/i);
  });

  it("2c: member cannot change anyone's role", async () => {
    mockSessionUser = { id: MEMBER_ID };
    const result = await updateMemberRole(
      { targetUserId: OWNER_ID, newRole: "admin" },
      memberCtx
    );
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/only owners and admins/i);
  });

  it("2d: member cannot create an invite", async () => {
    mockSessionUser = { id: MEMBER_ID };
    const result = await createInvite(
      { email: "forged@evil.com", role: "admin" },
      memberCtx
    );
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/only owners and admins/i);
  });
});
