/**
 * Guest invite forge proof.
 *
 * Proves the activation switch: an owner can issue a guest invite via
 * createInvite, and accepting it creates a workspace_members row with
 * role === "guest". Positive control: member invite still works.
 * Negative control: invalid role is rejected by the zod schema.
 *
 * ISOLATION: seeds its OWN workspace, profiles, members.
 * Does NOT touch any row another test file uses.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db, workspaceMembers, profiles, workspaces, invites } from "@/db";
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

const WS_ID = "00000000-0000-4000-d000-000000000001";
const OWNER_ID = "00000000-0000-4000-d000-000000000010";

beforeAll(async () => {
  await db.insert(workspaces).values({
    id: WS_ID,
    name: "Invite Test WS",
    slug: "invite-test-ws",
  }).onConflictDoNothing();

  await db.insert(profiles).values({
    id: OWNER_ID,
    orgId: WS_ID,
    fullName: "Invite Owner",
    email: "owner-invite@forge.test",
    role: "pm",
  }).onConflictDoNothing();

  await db.insert(workspaceMembers).values({
    workspaceId: WS_ID,
    userId: OWNER_ID,
    role: "owner",
    isActive: true,
  }).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(invites).where(eq(invites.orgId, WS_ID));
  await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, WS_ID));
  await db.delete(profiles).where(eq(profiles.orgId, WS_ID));
  await db.delete(workspaces).where(eq(workspaces.id, WS_ID));
});

describe("Guest invite — issue", () => {
  it("owner issues a guest invite → invite row role === 'guest'", async () => {
    mockSessionUser = { id: OWNER_ID };

    const { createInvite } = await import("@/app/(app)/settings/members/actions");
    const result = await createInvite(
      { email: "new-guest@forge.test", role: "guest" },
      { orgId: WS_ID }
    );

    expect(result).toHaveProperty("success", true);

    const [inv] = await db
      .select({ role: invites.role, email: invites.email, status: invites.status })
      .from(invites)
      .where(and(eq(invites.orgId, WS_ID), eq(invites.email, "new-guest@forge.test")));

    expect(inv).toBeDefined();
    expect(inv.role).toBe("guest");
    expect(inv.status).toBe("pending");
  });
});

describe("Guest invite — accept", () => {
  it("accepting the guest invite → workspace_members role === 'guest'", async () => {
    const GUEST_ID = "00000000-0000-4000-d000-000000000020";
    mockSessionUser = { id: GUEST_ID, email: "new-guest@forge.test" };

    const [inv] = await db
      .select({ token: invites.token })
      .from(invites)
      .where(and(eq(invites.orgId, WS_ID), eq(invites.email, "new-guest@forge.test")));

    expect(inv).toBeDefined();

    const { acceptInvite } = await import("@/app/(auth)/invite/[token]/actions");

    let redirectTarget: string | null = null;
    try {
      await acceptInvite(inv.token);
    } catch (e: unknown) {
      if (e && typeof e === "object" && "digest" in e) {
        const digest = (e as { digest: string }).digest;
        if (digest.includes("NEXT_REDIRECT")) {
          redirectTarget = digest;
        } else {
          throw e;
        }
      } else {
        throw e;
      }
    }

    expect(redirectTarget).toBeTruthy();

    const [membership] = await db
      .select({ role: workspaceMembers.role, isActive: workspaceMembers.isActive })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, WS_ID),
          eq(workspaceMembers.userId, GUEST_ID)
        )
      );

    expect(membership).toBeDefined();
    expect(membership.role).toBe("guest");
    expect(membership.isActive).toBe(true);
  });
});

describe("Positive control — member invite still works", () => {
  it("owner issues a member invite → invite row role === 'member'", async () => {
    mockSessionUser = { id: OWNER_ID };

    const { createInvite } = await import("@/app/(app)/settings/members/actions");
    const result = await createInvite(
      { email: "new-member@forge.test", role: "member" },
      { orgId: WS_ID }
    );

    expect(result).toHaveProperty("success", true);

    const [inv] = await db
      .select({ role: invites.role })
      .from(invites)
      .where(and(eq(invites.orgId, WS_ID), eq(invites.email, "new-member@forge.test")));

    expect(inv).toBeDefined();
    expect(inv.role).toBe("member");
  });
});

describe("Negative control — invalid role rejected", () => {
  it("forged invite with role 'superadmin' → rejected by schema", async () => {
    mockSessionUser = { id: OWNER_ID };

    const { createInvite } = await import("@/app/(app)/settings/members/actions");
    const result = await createInvite(
      { email: "hacker@forge.test", role: "superadmin" },
      { orgId: WS_ID }
    );

    expect(result).toHaveProperty("error");

    const rows = await db
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.orgId, WS_ID), eq(invites.email, "hacker@forge.test")));

    expect(rows).toHaveLength(0);
  });
});
