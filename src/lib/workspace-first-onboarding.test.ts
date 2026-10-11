import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { db, profiles } from "@/db";

let session: {
  userId: string | null;
  orgId: string | null;
  orgRole: string | null;
};

const USER_ID = "user_workspace_first_test";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => session),
  currentUser: vi.fn(async () => ({
    id: USER_ID,
    firstName: "Lane",
    lastName: "Test",
    username: null,
    primaryEmailAddress: { emailAddress: "workspace-first@example.com" },
    imageUrl: "https://example.com/avatar.png",
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getWorkspace } from "./ensure-workspace";
import { saveOnboardingRole } from "@/app/(auth)/onboarding/actions";

beforeEach(() => {
  session = { userId: USER_ID, orgId: "org_test_a", orgRole: "org:member" };
  vi.mocked(revalidatePath).mockClear();
});

afterEach(async () => {
  await db.delete(profiles).where(eq(profiles.id, USER_ID));
});

describe("workspace-first onboarding", () => {
  it.each([
    { userId: null, orgId: null, orgRole: null },
    { userId: USER_ID, orgId: null, orgRole: null },
    { userId: USER_ID, orgId: "org_test_a", orgRole: "org:unknown" },
  ])("does not expose Lane onboarding without recognized membership: %j", async (auth) => {
    session = auth;
    expect(await getWorkspace()).toBeNull();
  });

  it("asks an active workspace member for their missing role label", async () => {
    expect(await getWorkspace()).toMatchObject({
      needsOnboarding: true,
      userId: USER_ID,
    });
  });

  it.each([
    { userId: null, orgId: null, orgRole: null },
    { userId: USER_ID, orgId: null, orgRole: null },
    { userId: USER_ID, orgId: "org_test_a", orgRole: "org:unknown" },
  ])("rejects a direct role submission without recognized membership: %j", async (auth) => {
    session = auth;
    expect(await saveOnboardingRole({ role: "pm" })).toHaveProperty("error");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(await db.select().from(profiles).where(eq(profiles.id, USER_ID))).toEqual([]);
  });

  it("saves a functional label without changing the Clerk permission", async () => {
    // Plan item 2.2: a saved role answers with / itself. The revalidation clears
    // the client's cached redirect from / back to /onboarding (staleTimes.dynamic
    // is 30 s), and the redirect carries a fresh render of / in the response.
    await expect(saveOnboardingRole({ role: "pm" })).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;replace;\/;/),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(await getWorkspace()).toMatchObject({
      needsOnboarding: false,
      userId: USER_ID,
      orgId: "org_test_a",
      role: "member",
    });
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, USER_ID));
    expect(profile.role).toBe("pm");
    expect(profile.fullName).toBe("Lane Test");
  });

  it("does not grant app access to an existing profile after its active workspace is lost", async () => {
    await expect(saveOnboardingRole({ role: "designer" })).rejects.toMatchObject({
      digest: expect.stringMatching(/^NEXT_REDIRECT;/),
    });
    session = { userId: USER_ID, orgId: null, orgRole: null };
    expect(await getWorkspace()).toBeNull();
  });
});
