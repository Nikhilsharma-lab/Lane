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

// A session still waiting on Clerk's choose-a-workspace step: Clerk reads it as signed out unless asked not to.
let pending = false;
const signedOut: MockClerkAuth = { userId: null, orgId: null, orgRole: null };

type MockClerkUser = {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  imageUrl: string;
};
let account: MockClerkUser | null = null;

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async (options?: { treatPendingAsSignedOut?: boolean }) => ({
    ...(pending && options?.treatPendingAsSignedOut !== false ? signedOut : session),
    // Clerk's redirect throws Next's redirect, back to the page after sign-in.
    redirectToSignIn: () => {
      throw new Error("redirect to sign-in, returning to this page");
    },
  })),
  currentUser: vi.fn(async () => account),
}));

beforeEach(() => {
  pending = false;
  account = null;
});

it("sends a signed-out visitor to sign in through Clerk's redirect", async () => {
  const { sendToSignIn } = await import("./session");
  await expect(sendToSignIn()).rejects.toThrow("redirect to sign-in, returning to this page");
});

describe("session seam: reading the signed-in account from Clerk", () => {
  const ada: MockClerkUser = {
    firstName: " Ada ",
    lastName: "Lovelace",
    username: "ada",
    primaryEmailAddress: { emailAddress: "ada@example.com" },
    imageUrl: "https://img.example/ada.png",
  };

  it("reads nothing when no account can be read", async () => {
    const { readAccount } = await import("./session");
    await expect(readAccount()).resolves.toBeNull();
  });

  it("reads the account name, primary email and image", async () => {
    account = ada;
    const { readAccount } = await import("./session");
    await expect(readAccount()).resolves.toEqual({ name: "Ada Lovelace", email: "ada@example.com", imageUrl: "https://img.example/ada.png" });
  });

  it("names the account by the account-name rule when it has no first or last name", async () => {
    const { readAccount } = await import("./session");
    account = { ...ada, firstName: null, lastName: null };
    await expect(readAccount()).resolves.toMatchObject({ name: "ada" });
    account = { ...ada, firstName: null, lastName: null, username: null };
    await expect(readAccount()).resolves.toMatchObject({ name: "ada@example.com" });
  });

  it("reads an empty email and the name User for an account with no name and no primary email", async () => {
    account = { ...ada, firstName: null, lastName: null, username: null, primaryEmailAddress: null };
    const { readAccount } = await import("./session");
    await expect(readAccount()).resolves.toEqual({ name: "User", email: "", imageUrl: "https://img.example/ada.png" });
  });
});

describe("session seam: reading the session from Clerk", () => {
  beforeEach(() => {
    session = { userId: null, orgId: null, orgRole: null };
  });

  it("reads no session for a signed-out visitor", async () => {
    const { readSession } = await import("./session");
    await expect(readSession()).resolves.toBeNull();
  });

  it.each([
    ["org:admin", "admin"],
    ["org:member", "member"],
    ["org:guest", "guest"],
    ["org:viewer", "viewer"],
  ])("translates the Clerk role key %s into Lane's %s", async (orgRole, role) => {
    session = { userId: "user_real", orgId: "org_lane", orgRole };
    const { readSession } = await import("./session");
    await expect(readSession()).resolves.toEqual({ userId: "user_real", orgId: "org_lane", role });
  });

  it("reads an unknown Clerk role key as no role", async () => {
    session = { userId: "user_real", orgId: "org_lane", orgRole: "org:billing" };
    const { readSession } = await import("./session");
    await expect(readSession()).resolves.toEqual({ userId: "user_real", orgId: "org_lane", role: null });
  });

  it("counts a pending session as signed in only when asked to", async () => {
    pending = true;
    session = { userId: "user_pending", orgId: null, orgRole: null };
    const { readSession } = await import("./session");
    await expect(readSession()).resolves.toBeNull();
    await expect(readSession({ pendingCountsAsSignedIn: true })).resolves.toEqual({ userId: "user_pending", orgId: null, role: null });
  });

  it("reads a person with no active workspace", async () => {
    session = { userId: "user_real", orgId: null, orgRole: null };
    const { readSession } = await import("./session");
    await expect(readSession()).resolves.toEqual({ userId: "user_real", orgId: null, role: null });
  });
});

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
