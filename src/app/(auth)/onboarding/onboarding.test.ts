import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { db, workspaces, profiles, workspaceMembers, invites } from "@/db";
import { eq, and, like } from "drizzle-orm";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    redirectMock(...args);
    const err = new Error("NEXT_REDIRECT");
    (err as any).digest = "NEXT_REDIRECT";
    throw err;
  },
}));

let mockSessionUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
} | null = null;

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

const FRESH_USER = "00000000-0000-4000-a000-000000000c01";
const SLUG_USER = "00000000-0000-4000-a000-000000000c02";
const GUARDED_USER = "00000000-0000-4000-a000-000000000c03";
const IDEM_USER = "00000000-0000-4000-a000-000000000c04";
const INVITE_USER = "00000000-0000-4000-a000-000000000c05";
const WORKSPACE_A = "e9e3b28e-f594-4ae1-85d9-bc85e66b5a19";

const FIXTURE_ORGS = [WORKSPACE_A, "649ace1d-14d8-40d1-9603-c91514f827cc"];

afterAll(async () => {
  for (const uid of [FRESH_USER, SLUG_USER, GUARDED_USER, IDEM_USER, INVITE_USER]) {
    const [p] = await db
      .select({ orgId: profiles.orgId })
      .from(profiles)
      .where(eq(profiles.id, uid));
    await db
      .delete(workspaceMembers)
      .where(eq(workspaceMembers.userId, uid));
    await db.delete(profiles).where(eq(profiles.id, uid));
    if (p && !FIXTURE_ORGS.includes(p.orgId)) {
      await db.delete(workspaces).where(eq(workspaces.id, p.orgId));
    }
  }
  await db
    .delete(invites)
    .where(like(invites.token, "test-invite-token-%"))
    .catch(() => {});
  await db
    .delete(workspaces)
    .where(eq(workspaces.slug, "collision-test"))
    .catch(() => {});
});

describe("completeOnboarding — function-via-Drizzle", () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it("creates workspace + profile + owner membership", async () => {
    mockSessionUser = {
      id: FRESH_USER,
      email: "fresh@test.local",
      user_metadata: { full_name: "Fresh User" },
    };
    const { completeOnboarding } = await import(
      "@/app/(auth)/onboarding/actions"
    );

    await expect(
      completeOnboarding({ fullName: "Fresh User", workspaceName: "Fresh Workspace", role: "pm" })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/");

    const [profile] = await db
      .select({
        orgId: profiles.orgId,
        fullName: profiles.fullName,
        role: profiles.role,
      })
      .from(profiles)
      .where(eq(profiles.id, FRESH_USER));
    expect(profile).toBeDefined();
    expect(profile.fullName).toBe("Fresh User");
    expect(profile.role).toBe("pm");

    const [ws] = await db
      .select({ name: workspaces.name, slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, profile.orgId));
    expect(ws.name).toBe("Fresh Workspace");
    expect(ws.slug).toBe("fresh-workspace");

    const [member] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, profile.orgId),
          eq(workspaceMembers.userId, FRESH_USER)
        )
      );
    expect(member.role).toBe("owner");
  });

  it("idempotent: existing profile → redirect, no duplicate workspace", async () => {
    mockSessionUser = {
      id: IDEM_USER,
      email: "idem@test.local",
      user_metadata: { full_name: "Idem User" },
    };
    const { completeOnboarding } = await import(
      "@/app/(auth)/onboarding/actions"
    );

    await expect(
      completeOnboarding({ fullName: "Idem User", workspaceName: "Idem Workspace", role: "designer" })
    ).rejects.toThrow("NEXT_REDIRECT");

    const [profileBefore] = await db
      .select({ orgId: profiles.orgId })
      .from(profiles)
      .where(eq(profiles.id, IDEM_USER));
    const orgIdBefore = profileBefore.orgId;

    redirectMock.mockClear();

    await expect(
      completeOnboarding({
        fullName: "Idem User",
        workspaceName: "Should Not Exist",
        role: "developer",
      })
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/");

    const [profileAfter] = await db
      .select({ orgId: profiles.orgId })
      .from(profiles)
      .where(eq(profiles.id, IDEM_USER));
    expect(profileAfter.orgId).toBe(orgIdBefore);

    const [dup] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.name, "Should Not Exist"));
    expect(dup).toBeUndefined();
  });

  it("slug collision: retries with numeric suffix", async () => {
    const [blocker] = await db
      .insert(workspaces)
      .values({ name: "Collision Blocker", slug: "collision-test" })
      .returning({ id: workspaces.id });

    mockSessionUser = {
      id: SLUG_USER,
      email: "slug@test.local",
      user_metadata: { full_name: "Slug User" },
    };
    const { completeOnboarding } = await import(
      "@/app/(auth)/onboarding/actions"
    );

    await expect(
      completeOnboarding({ fullName: "Slug User", workspaceName: "Collision Test", role: "developer" })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/");

    const [profile] = await db
      .select({ orgId: profiles.orgId })
      .from(profiles)
      .where(eq(profiles.id, SLUG_USER));

    const [ws] = await db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, profile.orgId));

    expect(ws.slug).toBe("collision-test-1");

    await db.delete(workspaces).where(eq(workspaces.id, blocker.id));
  });

  it("idempotent guard: existing profile → redirect, no second workspace", async () => {
    await db
      .insert(profiles)
      .values({
        id: GUARDED_USER,
        orgId: WORKSPACE_A,
        fullName: "Guarded User",
        email: "guarded@test.local",
        role: "designer",
      })
      .onConflictDoNothing();
    await db
      .insert(workspaceMembers)
      .values({
        workspaceId: WORKSPACE_A,
        userId: GUARDED_USER,
        role: "member",
        isActive: true,
      })
      .onConflictDoNothing();

    mockSessionUser = {
      id: GUARDED_USER,
      email: "guarded@test.local",
      user_metadata: { full_name: "Guarded User" },
    };
    const { completeOnboarding } = await import(
      "@/app/(auth)/onboarding/actions"
    );

    await expect(
      completeOnboarding({ fullName: "Guarded User", workspaceName: "Should Not Exist", role: "pm" })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/");

    const [ws] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.name, "Should Not Exist"));
    expect(ws).toBeUndefined();

    const [profile] = await db
      .select({ orgId: profiles.orgId })
      .from(profiles)
      .where(eq(profiles.id, GUARDED_USER));
    expect(profile.orgId).toBe(WORKSPACE_A);
  });
});

describe("onboarding — invite-first", () => {
  beforeEach(() => {
    redirectMock.mockClear();
  });

  it("pending invite → accept joins existing workspace, no new workspace", async () => {
    await db.insert(invites).values({
      orgId: WORKSPACE_A,
      email: "invited@test.local",
      token: "test-invite-token-accept",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 86400000),
    });

    const { getPendingInvites } = await import(
      "@/app/(auth)/onboarding/get-pending-invites"
    );
    const found = await getPendingInvites("invited@test.local");
    expect(found).toHaveLength(1);
    expect(found[0].workspaceName).toBe("Test Workspace A");
    expect(found[0].role).toBe("member");

    mockSessionUser = {
      id: INVITE_USER,
      email: "invited@test.local",
      user_metadata: { full_name: "Invited User" },
    };
    const { acceptInvite } = await import(
      "@/app/(auth)/invite/[token]/actions"
    );

    await expect(
      acceptInvite("test-invite-token-accept")
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/");

    const [profile] = await db
      .select({ orgId: profiles.orgId })
      .from(profiles)
      .where(eq(profiles.id, INVITE_USER));
    expect(profile.orgId).toBe(WORKSPACE_A);

    const [member] = await db
      .select({
        role: workspaceMembers.role,
        workspaceId: workspaceMembers.workspaceId,
      })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, INVITE_USER),
          eq(workspaceMembers.isActive, true)
        )
      );
    expect(member.workspaceId).toBe(WORKSPACE_A);
    expect(member.role).toBe("member");
  });

  it("email-scoping: only returns invites for the queried email", async () => {
    await db.insert(invites).values([
      {
        orgId: WORKSPACE_A,
        email: "scoped@test.local",
        token: "test-invite-token-scoped",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 86400000),
      },
      {
        orgId: WORKSPACE_A,
        email: "other@test.local",
        token: "test-invite-token-other",
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 86400000),
      },
    ]);

    const { getPendingInvites } = await import(
      "@/app/(auth)/onboarding/get-pending-invites"
    );

    const scopedResults = await getPendingInvites("scoped@test.local");
    expect(scopedResults).toHaveLength(1);
    expect(scopedResults[0].token).toBe("test-invite-token-scoped");

    const otherResults = await getPendingInvites("other@test.local");
    expect(otherResults).toHaveLength(1);
    expect(otherResults[0].token).toBe("test-invite-token-other");

    const noResults = await getPendingInvites("nobody@test.local");
    expect(noResults).toHaveLength(0);
  });

  it("no pending invite → create path unaffected", async () => {
    const { getPendingInvites } = await import(
      "@/app/(auth)/onboarding/get-pending-invites"
    );
    const found = await getPendingInvites("no-invites@test.local");
    expect(found).toHaveLength(0);
  });
});
