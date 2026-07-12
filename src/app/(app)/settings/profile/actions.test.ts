import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, profiles } from "@/db";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let mockSessionUser: { id: string } | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: mockSessionUser }, error: null }),
    },
  })),
}));

import { updateProfileRole } from "./actions";

const OWNER_ID = "7c683bdd-43ce-42c4-847a-3fb5663b2926";
const MEMBER_ID = "b0784525-9e27-46c7-9bdd-066ceb776674";
const OUTSIDER_ID = "121fe28c-ae3f-4fc7-92c2-ccb195f3b97c";
const ORG_ID = "e9e3b28e-f594-4ae1-85d9-bc85e66b5a19";

afterEach(async () => {
  await db.update(profiles).set({ role: "pm" }).where(eq(profiles.id, OWNER_ID));
  await db.update(profiles).set({ role: "designer" }).where(eq(profiles.id, MEMBER_ID));
});

describe("updateProfileRole", () => {
  it("updates only the signed-in member's profile label", async () => {
    mockSessionUser = { id: MEMBER_ID };

    const result = await updateProfileRole(
      { role: "developer" },
      { orgId: ORG_ID }
    );
    expect(result).toEqual({ success: true });

    const [profile] = await db
      .select({ role: profiles.role })
      .from(profiles)
      .where(and(eq(profiles.id, MEMBER_ID), eq(profiles.orgId, ORG_ID)));
    expect(profile.role).toBe("developer");
  });

  it("rejects an invalid role", async () => {
    mockSessionUser = { id: MEMBER_ID };
    const result = await updateProfileRole(
      { role: "admin" },
      { orgId: ORG_ID }
    );
    expect(result).toEqual({ error: "Choose a valid role." });
  });

  it("rejects a signed-in user outside the requested workspace", async () => {
    mockSessionUser = { id: OUTSIDER_ID };
    const result = await updateProfileRole(
      { role: "developer" },
      { orgId: ORG_ID }
    );
    expect(result).toHaveProperty("error");
  });
});
