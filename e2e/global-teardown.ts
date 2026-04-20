// Runs once after all test files complete. Removes test users created
// by global-setup.ts. Wrapped in try/catch so cleanup failures never
// fail the test run — the worst case is leftover test users in lane
// dev's auth.users, which is harmless and gets cleaned up on the next
// global-setup.ts pass (it deletes pre-existing users with the same
// email before recreating).
//
// Note: if global-setup.ts itself throws, Playwright may not invoke
// global-teardown.ts. In that case, leftover test users persist until
// the next successful setup pass.

import { createClient } from "@supabase/supabase-js";

// Must match the domain used in global-setup.ts.
const TEST_EMAIL_DOMAIN = "@e2e.lane.test";

async function globalTeardown() {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.warn("[globalTeardown] env vars missing — skipping cleanup");
      return;
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data } = await supabase.auth.admin.listUsers();
    const testUsers = data?.users.filter((u) => u.email?.endsWith(TEST_EMAIL_DOMAIN)) ?? [];

    for (const u of testUsers) {
      await supabase.auth.admin.deleteUser(u.id);
    }

    console.log(`[globalTeardown] deleted ${testUsers.length} test user(s)`);
  } catch (e) {
    // Non-fatal: log and move on so a flaky cleanup doesn't fail an otherwise-green test run.
    console.error("[globalTeardown] cleanup failed (non-fatal):", e);
  }
}

export default globalTeardown;
