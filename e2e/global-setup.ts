// Runs once per test session before any test file. Creates a small
// roster of test users via Supabase admin API on lane dev.
//
// A2a scope: auth.users rows only. No storageState is written and no
// browser is launched — A2a's smoke test runs unauthenticated. The
// auth users exist so Phase D tests (signup verification, invite flows)
// can use them once added.
//
// TODO(B1): Once lane dev has the Lane public schema applied
// (drizzle-kit push, per ROADMAP parking lot), extend this to also
// create profiles + organizations + workspace_members rows for each
// test user. Until then, users exist in auth.users only and can
// authenticate but cannot interact with Lane workflows that depend
// on the public schema.
//
// TODO(A2b): When email capture lands, add storageState saving here
// so authenticated test scenarios can resume sessions without going
// through the login flow each time.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Email domain used to identify test users for cleanup. Must match
// the domain check in global-teardown.ts.
const TEST_EMAIL_DOMAIN = "@e2e.lane.test";

const TEST_USERS = [
  { email: `owner${TEST_EMAIL_DOMAIN}`, password: "test-password-1234", role: "owner" },
];

async function globalSetup() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.log(
      "[globalSetup] env vars absent (SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL missing).\n" +
        "Skipping test user creation. Expected in CI; locally, check .env.local.\n" +
        "Tests that require authenticated fixtures will fail their own setup\n" +
        "assertions when run in this state — that's correct behavior, not a bug."
    );
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  for (const user of TEST_USERS) {
    // Idempotent: delete any pre-existing user with this email, then create fresh.
    // Using listUsers + filter rather than getUserByEmail because the latter is
    // not in the admin client at the time of writing.
    const { data: existing } = await supabase.auth.admin.listUsers();
    const found = existing?.users.find((u) => u.email === user.email);
    if (found) {
      await supabase.auth.admin.deleteUser(found.id);
    }

    const { error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (error) {
      throw new Error(`[setup] failed to create test user ${user.email}: ${error.message}`);
    }
  }

  console.log(`[globalSetup] created ${TEST_USERS.length} test user(s)`);
}

export default globalSetup;
