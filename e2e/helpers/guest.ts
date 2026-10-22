import type { Browser } from "@playwright/test";
import postgres from "postgres";
import { assertOwnedOrganization, assertOwnedUser } from "./fixtures";
import { assertE2ETarget } from "./safety";
import { createTestUser, signInTestUser } from "./test-user";

/**
 * Issue #107 (spec #101): a guest in a workspace this worker created, signed
 * in on its own browser context. Same pattern as createReviewTeam's
 * org:member teammates (reviewers.ts), with the org:guest role. The fixture
 * keeps its creation receipt, so the owner's cleanup can remove it.
 */
export async function addGuestToWorkspace(browser: Browser, orgId: string, name = "Review Guest") {
  const user = await createTestUser("guest");
  const client = await assertOwnedUser(user.id);
  await client.users.updateUser(user.id, { firstName: name, lastName: "" });
  await (await assertOwnedOrganization(orgId)).organizations.createOrganizationMembership({
    organizationId: orgId,
    userId: user.id,
    role: "org:guest",
  });
  const sql = postgres(assertE2ETarget().databaseUrl, { ssl: "require", max: 1 });
  try {
    await sql`insert into profiles(id,full_name,email,role) values (${user.id},${name},${user.email},'designer')`;
  } finally {
    await sql.end();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await signInTestUser(page, user, orgId);
  return { user, page, close: () => context.close() };
}
