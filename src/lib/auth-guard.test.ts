/** The workspace guards above the session seam: the seam's `readSession` is faked, the guards are real. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "./session";

let session: Session | null = null;
vi.mock("./session", () => ({ readSession: vi.fn(async () => session) }));

beforeEach(() => { session = null; });

describe("workspace guards", () => {
  it("rejects an unauthenticated caller", async () => {
    const { requireActiveMember } = await import("./auth-guard");

    await expect(requireActiveMember("org_lane")).resolves.toBeNull();
  });

  it("rejects a forged organization context", async () => {
    session = {
      userId: "user_real",
      orgId: "org_real",
      role: "admin",
    };
    const { requireActiveMember } = await import("./auth-guard");

    await expect(requireActiveMember("org_forged")).resolves.toBeNull();
  });

  it("binds identity and organization role to the session", async () => {
    session = {
      userId: "user_real",
      orgId: "org_lane",
      role: "member",
    };
    const { requireActiveMember } = await import("./auth-guard");

    await expect(requireActiveMember("org_lane")).resolves.toEqual({
      userId: "user_real",
      orgId: "org_lane",
      role: "member",
    });
  });

  it("permits only Admins to manage members", async () => {
    session = {
      userId: "user_admin",
      orgId: "org_lane",
      role: "admin",
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
      role: "member",
    };
    await expect(requireOwnerOrAdmin("org_lane")).resolves.toBeNull();
  });

  it("honors the Guest role", async () => {
    session = {
      userId: "user_guest",
      orgId: "org_lane",
      role: "guest",
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
  it("lets a Viewer read but never change things", async () => {
    session = { userId: "user_viewer", orgId: "org_lane", role: "viewer" };
    const { requireActiveMember, requireCanChange, requireCanContribute, requireOwnerOrAdmin } = await import("./auth-guard");

    await expect(requireActiveMember("org_lane")).resolves.toEqual({ userId: "user_viewer", orgId: "org_lane", role: "viewer" });
    await expect(requireCanChange("org_lane")).resolves.toBeNull();
    await expect(requireCanContribute("org_lane")).resolves.toBeNull();
    await expect(requireOwnerOrAdmin("org_lane")).resolves.toBeNull();
  });

  it("lets Admins and Members change things", async () => {
    const { requireCanChange, requireCanContribute } = await import("./auth-guard");
    for (const role of ["admin", "member"] as const) {
      session = { userId: `user_${role}`, orgId: "org_lane", role };
      await expect(requireCanChange("org_lane")).resolves.toMatchObject({ role });
      await expect(requireCanContribute("org_lane")).resolves.toMatchObject({ role });
      await expect(requireCanChange("org_other")).resolves.toBeNull();
    }
  });

  it("gives a role Lane doesn’t know no access at all", async () => {
    session = { userId: "user_x", orgId: "org_lane", role: null };
    const { requireActiveMember } = await import("./auth-guard");
    await expect(requireActiveMember("org_lane")).resolves.toBeNull();
  });
});

describe("action guard classification", () => {
  it("classifies expiry and copy from one session snapshot", async () => {
    session = null;
    const { readSession } = await import("./session");
    const { guardActiveMember, SESSION_ENDED } = await import("./auth-guard");
    vi.mocked(readSession).mockClear();
    await expect(guardActiveMember("org_lane", "Not found")).resolves.toEqual({ error: SESSION_ENDED, sessionExpired: true });
    expect(readSession).toHaveBeenCalledTimes(1);
  });
  it.each<Session>([
    { userId: "real", orgId: null, role: "member" },
    { userId: "real", orgId: "other", role: "admin" },
    { userId: "real", orgId: "org_lane", role: null },
    { userId: "real", orgId: "org_lane", role: "guest" },
  ])("never marks workspace or role denial as expiry: %o", async denied => {
    session = denied;
    const { guardCanChange } = await import("./auth-guard");
    await expect(guardCanChange("org_lane", "Not found")).resolves.toEqual({ error: "Not found" });
  });
});

it("keeps Viewer personal state and Guest contributions distinct from replayable expiry in one session read", async () => {
  const { readSession } = await import("./session");
  const { guardActiveMember, guardCanChange, guardCanContribute, guardOwnerOrAdmin, VIEWER_REFUSAL } = await import("./auth-guard");
  for (const role of ["guest", "viewer", "member", "admin"] as const) {
    session = { userId: "person", orgId: "org_lane", role };
    for (const guard of [guardActiveMember, guardCanContribute, guardCanChange, guardOwnerOrAdmin]) {
      vi.mocked(readSession).mockClear();
      const result = await guard("org_lane", "Not permitted");
      expect(readSession).toHaveBeenCalledTimes(1);
      const allowed = guard === guardActiveMember || (guard === guardCanContribute && role !== "viewer") || (guard === guardCanChange && ["admin", "member"].includes(role)) || (guard === guardOwnerOrAdmin && role === "admin");
      expect(result).toEqual(allowed ? { userId: "person", orgId: "org_lane", role } : { error: role === "viewer" ? VIEWER_REFUSAL : "Not permitted" });
    }
  }
});
