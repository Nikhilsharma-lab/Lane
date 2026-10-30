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
    const { guardCanChange } = await import("./auth-guard");
    await expect(guardCanChange("org_lane", "Not found")).resolves.toEqual({ error: "Not found" });
  });
});


it("keeps Viewer personal state and Guest contributions distinct from replayable expiry in one auth read", async () => {
  const { auth } = await import("@clerk/nextjs/server");
  const { guardActiveMember, guardCanChange, guardCanContribute, guardOwnerOrAdmin, VIEWER_REFUSAL } = await import("./auth-guard");
  for (const role of ["guest", "viewer", "member", "admin"] as const) {
    session = { userId: "person", orgId: "org_lane", orgRole: `org:${role}` };
    for (const guard of [guardActiveMember, guardCanContribute, guardCanChange, guardOwnerOrAdmin]) {
      vi.mocked(auth).mockClear();
      const result = await guard("org_lane", "Not permitted");
      expect(auth).toHaveBeenCalledTimes(1);
      const allowed = guard === guardActiveMember || (guard === guardCanContribute && role !== "viewer") || (guard === guardCanChange && ["admin", "member"].includes(role)) || (guard === guardOwnerOrAdmin && role === "admin");
      expect(result).toEqual(allowed ? { userId: "person", orgId: "org_lane", role } : { error: role === "viewer" ? VIEWER_REFUSAL : "Not permitted" });
    }
  }
});
