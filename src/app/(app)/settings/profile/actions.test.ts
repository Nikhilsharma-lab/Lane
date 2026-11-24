import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { callAction } from "@/lib/action-call";
import { db, profiles, queryCounter } from "@/db";
import type { Session } from "@/lib/session";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockSession: Session | null = null;

vi.mock("@/lib/session", () => ({
  readSession: vi.fn(async () => mockSession),
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
