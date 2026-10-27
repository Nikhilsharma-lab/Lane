import { clerk } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

import { safeClerkClient } from "./safety";
import {
  assertOwnedUser,
  borrowMarker,
  borrowedUserNames,
  fixtureMetadata,
  forgetBorrowedUser,
  forgetOrganization,
  forgetUser,
  ownedUserScope,
  recordBorrowedUser,
  recordCreatedOrganization,
  recordCreatedUser,
  testEmail,
} from "./fixtures";

export type TestUser = {
  id: string;
  email: string;
  password: string;
};

export async function createClerkTestOrganization(
  userId: string,
  name: string
): Promise<string> {
  const client = await assertOwnedUser(userId);
  const organization = await client.organizations.createOrganization({
    name,
    createdBy: userId,
    privateMetadata: fixtureMetadata,
  });
  recordCreatedOrganization(organization.id, userId);
  return organization.id;
}

type ClerkClient = Awaited<ReturnType<typeof safeClerkClient>>;

const FIXTURE_NAMES = { firstName: "Lane", lastName: "E2E" };
const BORROWABLE_EMAIL = /^lane-e2e-.+\+clerk_test@example\.com$/;

const atUserCap = (error: unknown) =>
  (error as { errors?: { code?: string }[] } | null)?.errors?.some((e) => e.code === "user_quota_exceeded") ?? false;

/**
 * A new Clerk user for one test. At the development instance's user cap, and only with
 * LANE_E2E_REUSE_USERS=1, it borrows an existing lane-e2e user instead (see borrowTestUser).
 */
export async function createTestUser(
  label: string,
  password = "LaneE2ETest1234!"
): Promise<TestUser> {
  const client = await safeClerkClient();
  const email = testEmail(label);
  try {
    const user = await client.users.createUser({
      emailAddress: [email],
      password,
      ...FIXTURE_NAMES,
      skipLegalChecks: true,
      privateMetadata: fixtureMetadata,
    });
    recordCreatedUser(user.id);
    return { id: user.id, email, password };
  } catch (error) {
    if (process.env.LANE_E2E_REUSE_USERS !== "1" || !atUserCap(error)) throw error;
    return borrowTestUser(client, password);
  }
}

/**
 * Borrows a lane-e2e user that is in no organization, takes `password`, and isn't borrowed by another run,
 * marks it, and names it as a new fixture. deleteTestUser gives it back; a crashed run leaves the mark for
 * inspection, so that user isn't borrowed again until someone clears it.
 */
async function borrowTestUser(client: ClerkClient, password: string): Promise<TestUser> {
  const { data } = await client.users.getUserList({ query: "lane-e2e-", limit: 100 });
  for (const candidate of data) {
    const email = candidate.emailAddresses.map((e) => e.emailAddress).find((address) => BORROWABLE_EMAIL.test(address));
    if (!email || borrowedUserNames(candidate.id) || "laneE2EBorrowedBy" in candidate.privateMetadata) continue;
    const memberships = await client.users.getOrganizationMembershipList({ userId: candidate.id, limit: 1 });
    if (memberships.totalCount > 0) continue;
    try {
      await client.users.verifyPassword({ userId: candidate.id, password });
    } catch {
      continue;
    }
    await client.users.updateUserMetadata(candidate.id, { privateMetadata: borrowMarker });
    // Another run marking the same user at the same moment: the last mark wins and the other moves on.
    const marked = await client.users.getUser(candidate.id);
    if (marked.privateMetadata.laneE2EBorrowedBy !== borrowMarker.laneE2EBorrowedBy) continue;
    recordBorrowedUser(candidate.id, { firstName: candidate.firstName, lastName: candidate.lastName });
    await client.users.updateUser(candidate.id, FIXTURE_NAMES);
    return { id: candidate.id, email, password };
  }
  throw new Error("[e2e] Clerk is at its user cap and no free lane-e2e user is left to borrow.");
}

/** Deletes the user's organizations from this run, then the user; a borrowed user is given back instead. */
export async function deleteTestUser(id: string): Promise<void> {
  const { client, orgIds } = await ownedUserScope(id);
  for (const orgId of orgIds) {
    await client.organizations.deleteOrganization(orgId);
    forgetOrganization(orgId);
  }
  const borrowedNames = borrowedUserNames(id);
  if (borrowedNames) {
    await client.users.updateUser(id, { firstName: borrowedNames.firstName ?? "", lastName: borrowedNames.lastName ?? "" });
    await client.users.updateUserMetadata(id, { privateMetadata: { laneE2EBorrowedBy: null } });
    forgetBorrowedUser(id);
    return;
  }
  await client.users.deleteUser(id);
  forgetUser(id);
}

export async function signInTestUser(
  page: Page,
  user: Pick<TestUser, "email">,
  organizationId?: string
): Promise<void> {
  await safeClerkClient();
  await page.goto("/login");
  await clerk.signIn({ page, emailAddress: user.email });

  if (organizationId) {
    await page.evaluate(async (orgId) => {
      await window.Clerk.setActive({ organization: orgId });
    }, organizationId);
  }
}
