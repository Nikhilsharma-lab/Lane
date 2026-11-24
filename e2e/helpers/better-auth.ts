/**
 * #399 (spec #383): the test-only Better Auth instance. It lives only here in e2e/ (lint refuses `testUtils` under
 * src/), signs with the checked target's secret and writes to its database, so the app accepts the sessions it makes;
 * `better-auth.setup.ts` proves that before any suite. It carries only the table mapping `testUtils` needs, which
 * must follow src/lib/auth-server.ts's: none of Lane's hooks, limits or emails run here.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization, testUtils } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { account, invitation, member, organizations, profiles, rateLimit, session, verification } from "../../src/db/schema";
import { assertE2ETarget, e2eAuthSecret } from "./safety";

function build({ databaseUrl, baseURL, ssl }: ReturnType<typeof assertE2ETarget>) {
  // Idle connections close themselves, so a worker exits without ending this one.
  const client = postgres(databaseUrl, { ssl, max: 2, idle_timeout: 5 });
  return betterAuth({
    secret: e2eAuthSecret(),
    // Decides the session cookie's name and domain, so it is the app's own address.
    baseURL,
    telemetry: { enabled: false },
    database: drizzleAdapter(drizzle(client), { provider: "pg", schema: { profiles, organizations, session, account, verification, member, invitation, rateLimit } }),
    user: {
      modelName: "profiles",
      fields: { name: "fullName" },
      additionalFields: { role: { type: "string", input: false, required: false, defaultValue: "designer" } },
    },
    plugins: [
      organization({
        schema: {
          organization: {
            modelName: "organizations",
            additionalFields: {
              plan: { type: "string", input: false, required: false, defaultValue: "free" },
              lastRequestNumber: { type: "number", input: false, required: false, defaultValue: 0 },
              ownerUserId: { type: "string", input: false, required: false },
            },
          },
        },
      }),
      testUtils(),
    ],
  });
}

let built: { key: string; context: ReturnType<typeof build>["$context"] } | undefined;

/** The instance's context, whose `test` holds testUtils' helpers. Built once per worker, and only for a checked target. */
export function testAuth() {
  const target = assertE2ETarget();
  const key = `${target.baseURL} ${target.databaseUrl}`;
  if (built?.key !== key) built = { key, context: build(target).$context };
  return built.context;
}

/** A new session for this person, as the cookies a Playwright context takes. `orgId` is its active workspace. */
export async function testSessionCookies(userId: string, orgId?: string) {
  const { test } = await testAuth();
  const { cookies } = await test.login({ userId, session: orgId ? { activeOrganizationId: orgId } : undefined });
  return cookies;
}
