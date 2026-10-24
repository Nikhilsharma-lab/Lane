import { beforeEach, describe, expect, it, vi } from "vitest";

type MockClerkAuth = {
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
};

let session: MockClerkAuth = {
  userId: null,
  orgId: null,
  orgRole: null,
};

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => session),
}));

describe("Clerk-backed workspace guards", () => {
  beforeEach(() => {
    session = { userId: null, orgId: null, orgRole: null };
    vi.resetModules();
  });

  it("rejects an unauthenticated caller", async () => {
    const { requireActiveMember } = await import("./auth-guard");

    await expect(requireActiveMember("org_lane")).resolves.toBeNull();
  });

  it("rejects a forged organization context", async () => {
    session = {
      userId: "user_real",
      orgId: "org_real",
      orgRole: "org:admin",
    };
    const { requireActiveMember } = await import("./auth-guard");

    await expect(requireActiveMember("org_forged")).resolves.toBeNull();
  });

  it("binds identity and organization role to the Clerk session", async () => {
    session = {
      userId: "user_real",
      orgId: "org_lane",
      orgRole: "org:member",
    };
    const { requireActiveMember } = await import("./auth-guard");

    await expect(requireActiveMember("org_lane")).resolves.toEqual({
      userId: "user_real",
      orgId: "org_lane",
      role: "member",
    });
  });

  it("permits only Clerk admins to manage members", async () => {
    session = {
      userId: "user_admin",
      orgId: "org_lane",
      orgRole: "org:admin",
    };
    const { requireOwnerOrAdmin } = await import("./auth-guard");

    await expect(requireOwnerOrAdmin("org_lane")).resolves.toEqual({
      userId: "user_admin",
      orgId: "org_lane",
      role: "admin",
    });

    session = {
      userId: "user_member",
      orgId: "org_lane",
      orgRole: "org:member",
    };
    await expect(requireOwnerOrAdmin("org_lane")).resolves.toBeNull();
  });

  it("honors a Clerk guest role without recreating guest membership state", async () => {
    session = {
      userId: "user_guest",
      orgId: "org_lane",
      orgRole: "org:guest",
    };
    const { requireActiveMember, requireMemberOrAbove } = await import(
      "./auth-guard"
    );

    await expect(requireActiveMember("org_lane")).resolves.toEqual({
      userId: "user_guest",
      orgId: "org_lane",
      role: "guest",
    });
    await expect(requireMemberOrAbove("org_lane")).resolves.toBeNull();
  });
});

describe("action guard classification", () => {
  it("classifies expiry and copy from one session snapshot", async () => {
    session = { userId: null, orgId: null, orgRole: null };
    const { auth } = await import("@clerk/nextjs/server");
    const { guardActiveMember, SESSION_ENDED } = await import("./auth-guard");
    vi.mocked(auth).mockClear();
    await expect(guardActiveMember("org_lane", "Not found")).resolves.toEqual({ error: SESSION_ENDED, sessionExpired: true });
    expect(auth).toHaveBeenCalledTimes(1);
  });
  it.each([
    { userId: "real", orgId: null, orgRole: "org:member" },
    { userId: "real", orgId: "other", orgRole: "org:admin" },
    { userId: "real", orgId: "org_lane", orgRole: "unknown" },
    { userId: "real", orgId: "org_lane", orgRole: "org:guest" },
  ])("never marks workspace or role denial as expiry: %o", async denied => {
    session = denied;
    const { guardMemberOrAbove } = await import("./auth-guard");
    await expect(guardMemberOrAbove("org_lane", "Not found")).resolves.toEqual({ error: "Not found" });
  });
});
