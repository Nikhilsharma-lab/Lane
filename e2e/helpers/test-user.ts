import { randomInt } from "node:crypto";
import type { Page } from "@playwright/test";

import { testAuth, testSessionCookies } from "./better-auth";
import { withE2EDatabase } from "./database";
import { deleteEmailCodes } from "./email-codes";
import { assertOwnedUser, forgetOrganization, forgetUser, ownedUserIdByEmail, ownedUserScope, recordCreatedUser, testEmail } from "./fixtures";
import { assertE2ETarget } from "./safety";

export type TestUser = {
  id: string;
  email: string;
  password: string;
};

/** A new person in no workspace, with a confirmed address and a password the real sign-in form takes. */
export async function createTestUser(
  label: string,
  password = "LaneE2ETest1234!"
): Promise<TestUser> {
  assertE2ETarget();
  const email = testEmail(label);
  const context = await testAuth();
  const { id } = await context.test.saveUser(context.test.createUser({ email, name: "Lane E2E" }));
  recordCreatedUser(id, email);
  await context.internalAdapter.linkAccount({ userId: id, accountId: id, providerId: "credential", password: await context.password.hash(password) });
  return { id, email, password };
}

/**
 * Deletes the workspaces this run made for the person, then the person, with their sessions, sign-in methods and
 * codes. A workspace with history that can't be deleted (a closed Request, a release, an agreement) stays for
 * inspection with everyone its rows name; those people's sessions and sign-in methods go.
 */
export async function deleteTestUser(id: string): Promise<void> {
  const { user, orgIds } = await ownedUserScope(id);
  const kept = user !== null && await withE2EDatabase(async (sql) => {
    const refused = await sql.begin(async (tx) => {
      for (const orgId of orgIds) await tx`delete from organizations where id = ${orgId} and owner_id = ${id}`;
      await tx`delete from profiles where id = ${id}`;
    }).then(() => false, (error) => {
      if (!keptByHistory(error)) throw error;
      return true;
    });
    if (refused) {
      console.warn("[e2e] Kept a person and their workspaces: their history can't be deleted.");
      await sql`delete from session where user_id = ${id}`;
      await sql`delete from account where user_id = ${id}`;
    }
    await deleteEmailCodes(sql, user.email);
    return refused;
  });
  // A kept workspace stays this run's, so its other people can still be deleted.
  if (!kept) for (const orgId of orgIds) forgetOrganization(orgId);
  forgetUser(id);
}

/** A history trigger refused the delete, or a row of a workspace that stays still names the person. */
function keptByHistory({ code, message }: { code?: string; message?: string }) {
  return code === "23503" || (code === "P0001" && / immutable$/.test(message ?? ""));
}

/**
 * Signs the page's browser in as this person with a new session, in place of any it had. `organizationId` is the
 * session's active workspace; without it the app opens their last-used one, else their oldest. It loads no page:
 * the next `goto` is signed in.
 */
export async function signInTestUser(
  page: Page,
  user: Pick<TestUser, "email">,
  organizationId?: string
): Promise<void> {
  const userId = await ownedUserIdByEmail(user.email);
  await page.context().addCookies(await testSessionCookies(userId, organizationId));
}

/** Ends every session the person has, as signing them out everywhere does. Their browsers keep cookies nothing answers to. */
export async function endTestSessions(userId: string): Promise<void> {
  await assertOwnedUser(userId);
  const { count } = await withE2EDatabase((sql) => sql`delete from session where user_id = ${userId}`);
  if (count === 0) throw new Error("[e2e] That person has no session to end.");
}

/**
 * Whose session the page's browser holds and its active workspace, as the app's `/api/auth` answers. Null signed out.
 * It asks from an address of its own: Better Auth counts every local browser as one, and a suite that loads pages
 * without a ten-second pause reaches the hundred it allows.
 */
export async function readTestSession(page: Page): Promise<{ userId: string; orgId: string | null } | null> {
  const response = await page.request.get(new URL("/api/auth/get-session", assertE2ETarget().baseURL).href, {
    headers: { "x-vercel-forwarded-for": `198.18.${randomInt(256)}.${randomInt(256)}` },
  });
  if (!response.ok()) throw new Error(`[e2e] The app's get-session answered ${response.status()}.`);
  const answer = (await response.json()) as { user: { id: string }; session: { activeOrganizationId?: string | null } } | null;
  return answer && { userId: answer.user.id, orgId: answer.session.activeOrganizationId ?? null };
}
