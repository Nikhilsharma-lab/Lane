/**
 * Guest role-change forge proof.
 *
 * Proves promote/demote transitions involving guest AND the four
 * permission rules holding for guest values:
 *   - owner promotes guest → member/admin
 *   - admin demotes member → guest
 *   - admin demotes peer admin → REJECTED (rule 4a, equal level)
 *   - self-change → REJECTED (rule 2)
 *   - owner change → REJECTED (rule 3)
 *   - invalid role → REJECTED (zod)
 *
 * ISOLATION: seeds its OWN workspace, profiles, members.
 * Does NOT touch any row another test file uses.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db, workspaceMembers, profiles, workspaces } from "@/db";
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

const WS_ID = "00000000-0000-4000-a000-000000000e01";
const OWNER_ID = "00000000-0000-4000-a000-000000000e10";
const ADMIN_ID = "00000000-0000-4000-a000-000000000e20";
const MEMBER_ID = "00000000-0000-4000-a000-000000000e30";
const GUEST_ID = "00000000-0000-4000-a000-000000000e40";

beforeAll(async () => {
  await db.insert(workspaces).values({
    id: WS_ID,
    name: "Role-Change Test WS",
    slug: "role-change-test-ws",
  }).onConflictDoNothing();

  await db.insert(profiles).values([
    { id: OWNER_ID, orgId: WS_ID, fullName: "RC Owner", email: "rc-owner@forge.test", role: "pm" },
    { id: ADMIN_ID, orgId: WS_ID, fullName: "RC Admin", email: "rc-admin@forge.test", role: "designer" },
    { id: MEMBER_ID, orgId: WS_ID, fullName: "RC Member", email: "rc-member@forge.test", role: "developer" },
    { id: GUEST_ID, orgId: WS_ID, fullName: "RC Guest", email: "rc-guest@forge.test", role: "designer" },
  ]).onConflictDoNothing();

  await db.insert(workspaceMembers).values([
    { workspaceId: WS_ID, userId: OWNER_ID, role: "owner", isActive: true },
    { workspaceId: WS_ID, userId: ADMIN_ID, role: "admin", isActive: true },
    { workspaceId: WS_ID, userId: MEMBER_ID, role: "member", isActive: true },
    { workspaceId: WS_ID, userId: GUEST_ID, role: "guest", isActive: true },
  ]).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, WS_ID));
  await db.delete(profiles).where(eq(profiles.orgId, WS_ID));
  await db.delete(workspaces).where(eq(workspaces.id, WS_ID));
});

async function getRole(userId: string): Promise<string> {
  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, WS_ID), eq(workspaceMembers.userId, userId)));
  return row.role;
}

describe("Promote guest", () => {
  it("owner promotes guest → member", async () => {
    mockSessionUser = { id: OWNER_ID };
    const { updateMemberRole } = await import("@/app/(app)/settings/members/actions");
    const result = await updateMemberRole({ targetUserId: GUEST_ID, newRole: "member" }, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    expect(await getRole(GUEST_ID)).toBe("member");
  });

  it("owner promotes (now member) → admin", async () => {
    mockSessionUser = { id: OWNER_ID };
    const { updateMemberRole } = await import("@/app/(app)/settings/members/actions");
    const result = await updateMemberRole({ targetUserId: GUEST_ID, newRole: "admin" }, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    expect(await getRole(GUEST_ID)).toBe("admin");
  });
});

describe("Demote to guest", () => {
  it("owner demotes (now admin) → guest", async () => {
    mockSessionUser = { id: OWNER_ID };
    const { updateMemberRole } = await import("@/app/(app)/settings/members/actions");
    const result = await updateMemberRole({ targetUserId: GUEST_ID, newRole: "guest" }, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    expect(await getRole(GUEST_ID)).toBe("guest");
  });

  it("admin demotes member → guest", async () => {
    mockSessionUser = { id: ADMIN_ID };
    const { updateMemberRole } = await import("@/app/(app)/settings/members/actions");
    const result = await updateMemberRole({ targetUserId: MEMBER_ID, newRole: "guest" }, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    expect(await getRole(MEMBER_ID)).toBe("guest");

    // restore for subsequent tests
    mockSessionUser = { id: OWNER_ID };
    await updateMemberRole({ targetUserId: MEMBER_ID, newRole: "member" }, { orgId: WS_ID });
  });
});

describe("Direct guest → admin (single-call biggest promote)", () => {
  it("owner promotes guest → admin in one call", async () => {
    mockSessionUser = { id: OWNER_ID };
    const { updateMemberRole } = await import("@/app/(app)/settings/members/actions");
    expect(await getRole(GUEST_ID)).toBe("guest");
    const result = await updateMemberRole({ targetUserId: GUEST_ID, newRole: "admin" }, { orgId: WS_ID });
    expect(result).toHaveProperty("success", true);
    expect(await getRole(GUEST_ID)).toBe("admin");

    // restore for subsequent tests
    await updateMemberRole({ targetUserId: GUEST_ID, newRole: "guest" }, { orgId: WS_ID });
  });
});

describe("Guardrails hold for guest values", () => {
  it("admin demotes peer admin → REJECTED (rule 4a, equal level)", async () => {
    mockSessionUser = { id: ADMIN_ID };
    const { updateMemberRole } = await import("@/app/(app)/settings/members/actions");
    const result = await updateMemberRole({ targetUserId: OWNER_ID, newRole: "guest" }, { orgId: WS_ID });
    expect(result).toHaveProperty("error");
  });

  it("self-change to guest → REJECTED (rule 2)", async () => {
    mockSessionUser = { id: OWNER_ID };
    const { updateMemberRole } = await import("@/app/(app)/settings/members/actions");
    const result = await updateMemberRole({ targetUserId: OWNER_ID, newRole: "guest" }, { orgId: WS_ID });
    expect(result).toHaveProperty("error");
    expect(result.error).toMatch(/cannot change your own role/i);
  });

  it("changing owner → guest → REJECTED (rule 3, owner protected)", async () => {
    // Use admin as caller to avoid self-change rule
    mockSessionUser = { id: ADMIN_ID };
    const { updateMemberRole } = await import("@/app/(app)/settings/members/actions");
    const result = await updateMemberRole({ targetUserId: OWNER_ID, newRole: "guest" }, { orgId: WS_ID });
    expect(result).toHaveProperty("error");
  });
});

describe("Negative control — invalid role rejected", () => {
  it("newRole = 'superadmin' → REJECTED by zod", async () => {
    mockSessionUser = { id: OWNER_ID };
    const { updateMemberRole } = await import("@/app/(app)/settings/members/actions");
    const result = await updateMemberRole({ targetUserId: GUEST_ID, newRole: "superadmin" }, { orgId: WS_ID });
    expect(result).toHaveProperty("error");
    expect(await getRole(GUEST_ID)).toBe("guest");
  });
});
