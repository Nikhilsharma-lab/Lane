import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { callAction } from "@/lib/action-call";
import { db, profiles, queryCounter } from "@/db";
import { accountNameOf } from "@/lib/account-name";
import { SESSION_ENDED } from "@/lib/auth-guard";
import type { Account, Session } from "@/lib/session";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockSession: Session | null = null;

// The sign-in account the session seam reads for the session's user (#261), already named by the account-name rule.
let mockAccount: Account | null = null;

vi.mock("@/lib/session", () => ({
  readSession: vi.fn(async () => mockSession),
  readAccount: vi.fn(async () => mockAccount),
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
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, role: "member" };
    mockAccount = { name: "Daniel Okafor", email: "daniel@example.com" };

    expect(await syncAccountName({ orgId: ORG_ID })).toEqual({ success: true });
    expect(await nameOf(MEMBER_ID)).toBe("Daniel Okafor");
    expect(await nameOf(OWNER_ID)).toBe(ownerBefore);
  });

  it("falls back to the email when the account has no name", async () => {
    await remember(MEMBER_ID);
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, role: "member" };
    // The seam names the account by the real account-name rule; this one has only an email.
    const nameless = { firstName: null, lastName: null, username: null, primaryEmailAddress: { emailAddress: "daniel@example.com" } };
    mockAccount = { name: accountNameOf(nameless), email: "daniel@example.com" };

    expect(await syncAccountName({ orgId: ORG_ID })).toEqual({ success: true });
    expect(await nameOf(MEMBER_ID)).toBe("daniel@example.com");
  });

  it("never takes a name from the browser", async () => {
    await remember(MEMBER_ID);
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, role: "member" };
    mockAccount = { name: "Daniel Okafor", email: "" };

    // A forged argument is ignored: the name only ever comes from the sign-in account.
    await (syncAccountName as unknown as (forged: unknown) => Promise<unknown>)({ orgId: ORG_ID, name: "Someone Else", fullName: "Someone Else", userId: OWNER_ID });
    expect(await nameOf(MEMBER_ID)).toBe("Daniel Okafor");
  });

  it("changes nothing without a signed-in person", async () => {
    await remember(MEMBER_ID);
    const before = await nameOf(MEMBER_ID);
    mockSession = null;
    mockAccount = { name: "Someone Else", email: "" };

    expect(await syncAccountName({ orgId: ORG_ID })).toEqual({ error: SESSION_ENDED, sessionExpired: true });
    expect(await nameOf(MEMBER_ID)).toBe(before);
  });

  it("changes nothing for someone signed in to another workspace", async () => {
    await remember(MEMBER_ID, OWNER_ID);
    const member = await nameOf(MEMBER_ID);
    const owner = await nameOf(OWNER_ID);
    mockSession = { userId: OUTSIDER_ID, orgId: "org_test_b", role: "member" };
    mockAccount = { name: "Someone Else", email: "" };

    expect(await syncAccountName({ orgId: ORG_ID })).toEqual({ error: "You do not have access to this workspace." });
    expect(await nameOf(MEMBER_ID)).toBe(member);
    expect(await nameOf(OWNER_ID)).toBe(owner);
  });
});

describe("updateProfileRole", () => {
  it("updates only the signed-in member's profile label", async () => {
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, role: "member" };

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
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, role: "member" };
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
      role: "member",
    };
    const result = await updateProfileRole(
      { role: "developer" },
      { orgId: ORG_ID }
    );
    expect(result).toHaveProperty("error");
  });
});

it("sends an actual profile write once when its response is lost", async () => {
  mockSession = { userId: MEMBER_ID, orgId: ORG_ID, role: "member" };
  let attempts = 0;
  const failure = new Error("401 response lost after commit");
  const observed = await queryCounter.measure(async () => {
    try {
      await callAction(async () => {
        attempts += 1;
        const result = await updateProfileRole({ role: "developer" }, { orgId: ORG_ID });
        if (attempts === 1) throw failure;
        return result;
      });
      return undefined;
    } catch (error) { return error; }
  });
  expect(observed.result).toBe(failure);
  expect(attempts).toBe(1);
  expect(observed.statements).toBe(1);
  const [saved] = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, MEMBER_ID));
  expect(saved.role).toBe("developer");
});

// Real guard → callAction → actual SQL.
it("sends an action whose session ended once, with no write", async () => {
  mockSession = null;
  const run = vi.fn(() => updateProfileRole({ role: "developer" }, { orgId: ORG_ID }));
  const observed = await queryCounter.measure(() => callAction(run));
  expect(observed.result).toEqual({ error: "Your session ended. Sign in again to continue.", sessionExpired: true });
  expect(run).toHaveBeenCalledTimes(1);
  expect(observed.statements).toBe(0);
});
