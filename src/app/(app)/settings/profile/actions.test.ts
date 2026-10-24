import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { callAction } from "@/lib/action-call";
import { db, profiles, queryCounter } from "@/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockSession: {
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
} = { userId: null, orgId: null, orgRole: null };

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => mockSession),
}));

import { updateProfileRole } from "./actions";

const OWNER_ID = "user_test_admin_a";
const MEMBER_ID = "user_test_member_a";
const OUTSIDER_ID = "user_test_outsider";
const ORG_ID = "org_test_a";

afterEach(async () => {
  await db.update(profiles).set({ role: "pm" }).where(eq(profiles.id, OWNER_ID));
  await db.update(profiles).set({ role: "designer" }).where(eq(profiles.id, MEMBER_ID));
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

it("does not replay an actual profile write when its response is lost", async () => {
  mockSession = { userId: MEMBER_ID, orgId: ORG_ID, orgRole: "org:member" };
  let attempts = 0;
  const failure = new Error("401 response lost after commit");
  const session = { current: vi.fn(async () => "current"), renew: vi.fn(async () => "renewed") };
  const observed = await queryCounter.measure(async () => {
    try {
      await callAction(async () => {
        attempts += 1;
        const result = await updateProfileRole({ role: "developer" }, { orgId: ORG_ID });
        if (attempts === 1) throw failure;
        return result;
      }, session);
      return undefined;
    } catch (error) { return error; }
  });
  expect(observed.result).toBe(failure);
  expect(attempts).toBe(1);
  expect(observed.statements).toBe(1);
  expect(session.renew).not.toHaveBeenCalled();
  const [saved] = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, MEMBER_ID));
  expect(saved.role).toBe("developer");
});

// Real guard → browser recovery → actual SQL. Attempts and committed statements
// are measured separately, so idempotent final state cannot hide duplicate writes.
it("retries pre-write expiry with changed copy and fresh session identity", async () => {
  mockSession = { userId: null, orgId: null, orgRole: null };
  const context = { orgId: ORG_ID };
  const attempts: { orgId: string }[] = [];
  const session = { current: async () => "old", renew: vi.fn(async () => {
    mockSession = { userId: MEMBER_ID, orgId: ORG_ID, orgRole: "org:member" };
    return "renewed";
  }) };
  const observed = await queryCounter.measure(() => callAction(async () => {
    attempts.push({ ...context });
    const result = await updateProfileRole({ role: "developer" }, context);
    return "error" in result ? { ...result, error: "Translated expiry copy" } : result;
  }, session));
  expect(observed.result).toEqual({ success: true });
  expect(observed.statements).toBe(1);
  expect(attempts).toEqual([{ orgId: ORG_ID }, { orgId: ORG_ID }]);
  expect(session.renew).toHaveBeenCalledTimes(1);
  const saved = await db.select({ id: profiles.id, role: profiles.role }).from(profiles);
  expect(saved.find(p => p.id === MEMBER_ID)?.role).toBe("developer");
  expect(saved.find(p => p.id === OWNER_ID)?.role).toBe("pm");
});

it.each([null, undefined, "", "   ", "reject"])("makes no write or replay on unusable renewal %s", async token => {
  mockSession = { userId: null, orgId: null, orgRole: null };
  const run = vi.fn(() => updateProfileRole({ role: "developer" }, { orgId: ORG_ID }));
  const observed = await queryCounter.measure(() => callAction(run, { current: async () => undefined, renew: async () => {
    if (token === "reject") throw new Error("offline");
    return token;
  } }));
  expect(observed.result).toMatchObject({ sessionExpired: true });
  expect(run).toHaveBeenCalledTimes(1);
  expect(observed.statements).toBe(0);
});

it("stops repeated real guard expiry after one replay with no writes", async () => {
  mockSession = { userId: null, orgId: null, orgRole: null };
  const run = vi.fn(() => updateProfileRole({ role: "developer" }, { orgId: ORG_ID }));
  const observed = await queryCounter.measure(() => callAction(run, { current: async () => "old", renew: async () => "renewed" }));
  expect(observed.result).toMatchObject({ sessionExpired: true });
  expect(run).toHaveBeenCalledTimes(2);
  expect(observed.statements).toBe(0);
});

it("retains the original workspace when renewal changes the active workspace", async () => {
  mockSession = { userId: null, orgId: null, orgRole: null };
  const context = { orgId: ORG_ID };
  const run = vi.fn(() => updateProfileRole({ role: "developer" }, context));
  const observed = await queryCounter.measure(() => callAction(run, { current: async () => "old", renew: async () => {
    mockSession = { userId: MEMBER_ID, orgId: "org_test_b", orgRole: "org:member" };
    return "renewed";
  } }));
  expect(observed.result).toEqual({ error: "You do not have access to this workspace." });
  expect(run).toHaveBeenCalledTimes(2);
  expect(observed.statements).toBe(0);
});
