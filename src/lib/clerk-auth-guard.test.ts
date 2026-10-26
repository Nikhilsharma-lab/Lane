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
    const { requireActiveMember, requireCanChange, requireCanContribute } = await import(
      "./auth-guard"
    );

    await expect(requireActiveMember("org_lane")).resolves.toEqual({
      userId: "user_guest",
      orgId: "org_lane",
      role: "guest",
    });
    await expect(requireCanContribute("org_lane")).resolves.toMatchObject({ role: "guest" });
    await expect(requireCanChange("org_lane")).resolves.toBeNull();
  });

  // #210: a Viewer reads everything a Member reads and changes nothing.
  it("lets a Clerk Viewer read but never change things", async () => {
    session = { userId: "user_viewer", orgId: "org_lane", orgRole: "org:viewer" };
    const { requireActiveMember, requireCanChange, requireCanContribute, requireOwnerOrAdmin } = await import("./auth-guard");

    await expect(requireActiveMember("org_lane")).resolves.toEqual({ userId: "user_viewer", orgId: "org_lane", role: "viewer" });
    await expect(requireCanChange("org_lane")).resolves.toBeNull();
    await expect(requireCanContribute("org_lane")).resolves.toBeNull();
    await expect(requireOwnerOrAdmin("org_lane")).resolves.toBeNull();
  });

  it("lets Admins and Members change things", async () => {
    const { requireCanChange, requireCanContribute } = await import("./auth-guard");
    for (const role of ["admin", "member"] as const) {
      session = { userId: `user_${role}`, orgId: "org_lane", orgRole: `org:${role}` };
      await expect(requireCanChange("org_lane")).resolves.toMatchObject({ role });
      await expect(requireCanContribute("org_lane")).resolves.toMatchObject({ role });
      await expect(requireCanChange("org_other")).resolves.toBeNull();
    }
  });

  it("gives an unknown Clerk role no access at all", async () => {
    session = { userId: "user_x", orgId: "org_lane", orgRole: "org:billing" };
    const { requireActiveMember } = await import("./auth-guard");
    await expect(requireActiveMember("org_lane")).resolves.toBeNull();
  });
});

describe("refusal copy", () => {
  beforeEach(() => vi.resetModules());
  it("says the session ended when nobody is signed in, and keeps the action's copy otherwise", async () => {
    session = { userId: null, orgId: null, orgRole: null };
    const { refusal, SESSION_ENDED } = await import("./auth-guard");
    await expect(refusal("Not found")).resolves.toBe(SESSION_ENDED);
    session = { userId: "user_real", orgId: "org_real", orgRole: "org:guest" };
    await expect(refusal("Not found")).resolves.toBe("Not found");
  });
});
