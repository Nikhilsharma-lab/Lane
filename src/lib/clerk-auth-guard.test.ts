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
