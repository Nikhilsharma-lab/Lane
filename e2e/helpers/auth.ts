import type { Page } from "@playwright/test";

import { provisionTestWorkspace } from "./cleanup";
import { signInTestUser, type TestUser } from "./test-user";

export async function provisionAndSignIn(
  page: Page,
  user: TestUser,
  options: {
    name: string;
    workspaceName: string;
    role?: "pm" | "designer" | "developer";
  }
): Promise<string> {
  const orgId = await provisionTestWorkspace({
    userId: user.id,
    email: user.email,
    ...options,
  });
  await signInTestUser(page, user, orgId);
  // External Clerk resources can keep the load event pending after Lane renders.
  // Individual journeys wait for the actual controls they need.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  return orgId;
}
