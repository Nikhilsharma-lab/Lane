import { clerkSetup } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";
import { cleanupTestUsers } from "./helpers/test-user";

setup("prepare Clerk testing token", async () => {
  await cleanupTestUsers();
  await clerkSetup();
});
