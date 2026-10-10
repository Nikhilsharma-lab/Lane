import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { safeClerkClient } from "./helpers/safety";

setup("prepare Clerk testing token", async () => {
  await safeClerkClient();
  await clerkSetup();
});
