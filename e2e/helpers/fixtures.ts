import { randomUUID } from "node:crypto";
import { safeClerkClient } from "./safety";

// Worker-local receipts: interrupted runs intentionally leave fixtures for
// explicit inspection, never a future name/email-prefix sweep.
const runId = randomUUID();
const startedAt = Date.now();
const users = new Set<string>();
const organizations = new Map<string, string>();
const reservedEmails = new Set<string>();
export const fixtureMetadata = { laneE2ERunId: runId };

// #257: at Clerk's user cap, LANE_E2E_REUSE_USERS=1 lets a fixture borrow an existing lane-e2e user
// (e2e/helpers/test-user.ts). This worker marks it with borrowMarker, keeps its own name here, and gives it
// back instead of deleting it.
type BorrowedNames = { firstName: string | null; lastName: string | null };
const borrowedUsers = new Map<string, BorrowedNames>();
export const borrowMarker = { laneE2EBorrowedBy: runId };
export function recordBorrowedUser(id: string, names: BorrowedNames) {
  borrowedUsers.set(id, names);
}
/** A borrowed user's own name, or undefined for a user this worker created. */
export function borrowedUserNames(id: string) {
  return borrowedUsers.get(id);
}
export function forgetBorrowedUser(id: string) {
  borrowedUsers.delete(id);
}

export function testEmail(label: string) {
  const email = `lane-e2e-${label}-${randomUUID().slice(0, 12)}+clerk_test@example.com`;
  reservedEmails.add(email);
  return email;
}
export function recordCreatedUser(id: string) {
  users.add(id);
}
export function recordCreatedOrganization(id: string, userId: string) {
  organizations.set(id, userId);
}
export function forgetOrganization(id: string) {
  organizations.delete(id);
}
export function forgetUser(id: string) {
  users.delete(id);
}

export async function assertOwnedUser(id: string) {
  const borrowed = borrowedUsers.has(id);
  if (!users.has(id) && !borrowed) throw new Error("[e2e] User has no creation or borrowing receipt in this worker.");
  const client = await safeClerkClient();
  const user = await client.users.getUser(id);
  const marker = borrowed ? user.privateMetadata.laneE2EBorrowedBy : user.privateMetadata.laneE2ERunId;
  if (marker !== runId) throw new Error("[e2e] User ownership marker does not match.");
  return client;
}

export async function assertOwnedOrganization(id: string) {
  const ownerId = organizations.get(id);
  if (!ownerId) throw new Error("[e2e] Organization has no creation receipt in this worker.");
  const client = await assertOwnedUser(ownerId);
  const org = await client.organizations.getOrganization({ organizationId: id });
  if (org.privateMetadata.laneE2ERunId !== runId || org.createdBy !== ownerId) {
    throw new Error("[e2e] Organization ownership does not match.");
  }
  return client;
}

export async function ownedUserScope(id: string) {
  const client = await assertOwnedUser(id);
  const memberships = await client.users.getOrganizationMembershipList({ userId: id, limit: 100 });
  if (
    memberships.totalCount > memberships.data.length ||
    memberships.data.some((m) => organizations.get(m.organization.id) !== id)
  ) {
    throw new Error("[e2e] User has unowned organization memberships; refusing cleanup.");
  }
  const orgIds = [...organizations].filter(([, owner]) => owner === id).map(([org]) => org);
  for (const orgId of orgIds) await assertOwnedOrganization(orgId);
  return { client, orgIds };
}

export async function registerBrowserTestUser(id: string, email: string) {
  if (!reservedEmails.has(email)) throw new Error("[e2e] Email was not reserved by this worker.");
  const client = await safeClerkClient();
  const user = await client.users.getUser(id);
  if (user.createdAt < startedAt || !user.emailAddresses.some((e) => e.emailAddress === email)) {
    throw new Error("[e2e] Browser user is not the newly created fixture.");
  }
  await client.users.updateUserMetadata(id, { privateMetadata: fixtureMetadata });
  recordCreatedUser(id);
}

export async function registerBrowserTestOrganization(id: string, userId: string, name: string) {
  const client = await assertOwnedUser(userId);
  const org = await client.organizations.getOrganization({ organizationId: id });
  if (org.createdBy !== userId || org.createdAt < startedAt || org.name !== name) {
    throw new Error("[e2e] Browser organization is not the newly created fixture.");
  }
  await client.organizations.updateOrganizationMetadata(id, { privateMetadata: fixtureMetadata });
  recordCreatedOrganization(id, userId);
}
