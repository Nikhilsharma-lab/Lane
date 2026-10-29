import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, profiles } from "@/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockSession: {
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
} = { userId: null, orgId: null, orgRole: null };

// The sign-in account Clerk holds for the session's user (#261).
let mockAccount: { firstName: string | null; lastName: string | null; username: string | null; primaryEmailAddress: { emailAddress: string } | null } | null = null;

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => mockSession),
  currentUser: vi.fn(async () => mockAccount),
}));

import { syncAccountName, updateProfileRole } from "./actions";

const OWNER_ID = "user_test_admin_a";
const MEMBER_ID = "user_test_member_a";
const OUTSIDER_ID = "user_test_outsider";
const ORG_ID = "org_test_a";

const savedNames = new Map<string, string>();
afterEach(async () => {
  await db.update(profiles).set({ role: "pm" }).where(eq(profiles.id, OWNER_ID));
  await db.update(profiles).set({ role: "designer" }).where(eq(profiles.id, MEMBER_ID));
  for (const [id, fullName] of savedNames) await db.update(profiles).set({ fullName }).where(eq(profiles.id, id));
  mockAccount = null;
});

const nameOf = async (id: string) => (await db.select({ fullName: profiles.fullName }).from(profiles).where(eq(profiles.id, id)))[0].fullName;
const remember = async (...ids: string[]) => { for (const id of ids) if (!savedNames.has(id)) savedNames.set(id, await nameOf(id)); };

describe("syncAccountName", () => {
  it("copies the sign-in account's name onto the signed-in person's profile, and no one else's", async () => {
    await remember(MEMBER_ID, OWNER_ID);
    const ownerBefore = await nameOf(OWNER_ID);
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, orgRole: "org:member" };
    mockAccount = { firstName: "Daniel", lastName: "Okafor", username: null, primaryEmailAddress: { emailAddress: "daniel@example.com" } };

    expect(await syncAccountName()).toEqual({ success: true });
    expect(await nameOf(MEMBER_ID)).toBe("Daniel Okafor");
    expect(await nameOf(OWNER_ID)).toBe(ownerBefore);
  });

  it("falls back to the email when the account has no name", async () => {
    await remember(MEMBER_ID);
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, orgRole: "org:member" };
    mockAccount = { firstName: null, lastName: null, username: null, primaryEmailAddress: { emailAddress: "daniel@example.com" } };

    expect(await syncAccountName()).toEqual({ success: true });
    expect(await nameOf(MEMBER_ID)).toBe("daniel@example.com");
  });

  it("never takes a name from the browser", async () => {
    await remember(MEMBER_ID);
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, orgRole: "org:member" };
    mockAccount = { firstName: "Daniel", lastName: "Okafor", username: null, primaryEmailAddress: null };

    // A forged argument is ignored: the name only ever comes from Clerk.
    await (syncAccountName as unknown as (forged: unknown) => Promise<unknown>)({ name: "Someone Else" });
    expect(await nameOf(MEMBER_ID)).toBe("Daniel Okafor");
  });

  it("changes nothing without a signed-in person", async () => {
    await remember(MEMBER_ID);
    const before = await nameOf(MEMBER_ID);
    mockSession = { userId: null, orgId: null, orgRole: null };
    mockAccount = { firstName: "Someone", lastName: "Else", username: null, primaryEmailAddress: null };

    expect(await syncAccountName()).toHaveProperty("error");
    expect(await nameOf(MEMBER_ID)).toBe(before);
  });
});

describe("updateProfileRole", () => {
  it("updates only the signed-in member's profile label", async () => {
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, orgRole: "org:member" };

    const result = await updateProfileRole(
      { role: "developer" },
      { orgId: ORG_ID }
    );
    expect(result).toEqual({ success: true });

    const [profile] = await db
      .select({ role: profiles.role })
      .from(profiles)
      .where(eq(profiles.id, MEMBER_ID));
    expect(profile.role).toBe("developer");
  });

  it("rejects an invalid role", async () => {
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, orgRole: "org:member" };
    const result = await updateProfileRole(
      { role: "admin" },
      { orgId: ORG_ID }
    );
    expect(result).toEqual({ error: "Choose a valid role." });
  });

  it("rejects a signed-in user outside the requested workspace", async () => {
    mockSession = {
      userId: OUTSIDER_ID,
      orgId: "org_test_b",
      orgRole: "org:member",
    };
    const result = await updateProfileRole(
      { role: "developer" },
      { orgId: ORG_ID }
    );
    expect(result).toHaveProperty("error");
  });
});
