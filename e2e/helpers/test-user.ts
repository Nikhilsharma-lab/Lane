import { clerkClient } from "@clerk/nextjs/server";
import { clerk } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

const TEST_EMAIL_DOMAIN = "example.com";

export type TestUser = {
  id: string;
  email: string;
  password: string;
};

export async function createClerkTestOrganization(
  userId: string,
  name: string
): Promise<string> {
  const client = await clerkClient();
  const organization = await client.organizations.createOrganization({
    name,
    createdBy: userId,
  });
  return organization.id;
}

export async function createTestUser(
  label: string,
  password = "LaneE2ETest1234!"
): Promise<TestUser> {
  const email = `lane-e2e-${label}-${Date.now()}+clerk_test@${TEST_EMAIL_DOMAIN}`;
  const client = await clerkClient();
  const user = await client.users.createUser({
    emailAddress: [email],
    password,
    firstName: "Lane",
    lastName: "E2E",
    skipLegalChecks: true,
  });
  return { id: user.id, email, password };
}

export async function deleteTestUser(id: string): Promise<void> {
  const client = await clerkClient();
  try {
    const memberships = await client.users.getOrganizationMembershipList({
      userId: id,
      limit: 100,
    });
    for (const membership of memberships.data) {
      if (membership.role === "org:admin") {
        await client.organizations
          .deleteOrganization(membership.organization.id)
          .catch(() => undefined);
      }
    }
    await client.users.deleteUser(id);
  } catch (error) {
    console.warn(
      `[e2e] deleteTestUser(${id}) failed: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

export async function cleanupTestUsers(): Promise<void> {
  const client = await clerkClient();
  const users = await client.users.getUserList({ limit: 500 });
  const testUsers = users.data.filter((user) =>
    user.emailAddresses.some((email) =>
      email.emailAddress.startsWith("lane-e2e-") &&
      email.emailAddress.endsWith(`+clerk_test@${TEST_EMAIL_DOMAIN}`)
    )
  );

  for (const user of testUsers) {
    await deleteTestUser(user.id);
  }

  if (testUsers.length > 0) {
    console.log(`[e2e] cleaned up ${testUsers.length} test user(s)`);
  }
}

export async function signInTestUser(
  page: Page,
  user: Pick<TestUser, "email">,
  organizationId?: string
): Promise<void> {
  await page.goto("/login");
  await clerk.signIn({ page, emailAddress: user.email });

  if (organizationId) {
    await page.evaluate(async (orgId) => {
      await window.Clerk.setActive({ organization: orgId });
    }, organizationId);
  }
}
