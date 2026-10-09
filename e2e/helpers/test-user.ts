import { clerk } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

import { safeClerkClient } from "./safety";
import { assertOwnedUser, fixtureMetadata, forgetOrganization, forgetUser, ownedUserScope, recordCreatedOrganization, recordCreatedUser, testEmail } from "./fixtures";

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

export async function createTestUser(
  label: string,
  password = "LaneE2ETest1234!"
): Promise<TestUser> {
  const client = await safeClerkClient();
  const email = testEmail(label);
  const user = await client.users.createUser({
    emailAddress: [email],
    password,
    firstName: "Lane",
    lastName: "E2E",
    skipLegalChecks: true,
    privateMetadata: fixtureMetadata,
  });
  recordCreatedUser(user.id);
  return { id: user.id, email, password };
}

export async function deleteTestUser(id: string): Promise<void> {
  const { client, orgIds } = await ownedUserScope(id);
  for (const orgId of orgIds) {
    await client.organizations.deleteOrganization(orgId);
    forgetOrganization(orgId);
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
