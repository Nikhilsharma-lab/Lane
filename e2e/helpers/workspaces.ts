import { randomUUID } from "node:crypto";
import { isWorkspacePermission, type WORKSPACE_ROLES } from "../../src/lib/role-rules";
import { testAuth } from "./better-auth";
import { withE2EDatabase } from "./database";
import { assertOwnedOrganization, assertOwnedUser, recordCreatedOrganization } from "./fixtures";

/** Lane's four roles, and no other. */
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** testUtils skips Lane's role allow-list, so the fixtures hold it. */
function assertLaneRole(role: string) {
  if (!isWorkspacePermission(role)) throw new Error("[e2e] A workspace role is admin, member, guest or viewer.");
}

/**
 * A workspace as Lane's own create leaves it: this person its creator, its Admin and last in it, a slug nobody sees,
 * and no logo or metadata. testUtils writes the rows directly, so none of Lane's hooks fill these in.
 */
export async function createTestWorkspace(userId: string, name: string): Promise<string> {
  await assertOwnedUser(userId);
  const { test } = await testAuth();
  // testUtils has the workspace helpers whenever the organization plugin is on, as it is in better-auth.ts.
  // An undefined metadata stays out of the write: Better Auth would store a null as the text "null".
  const made = await test.saveOrganization!(test.createOrganization!({ name, slug: randomUUID(), ownerUserId: userId, logo: null, metadata: undefined }));
  const orgId = made.id as string;
  recordCreatedOrganization(orgId, userId);
  await addTestMember(orgId, userId, "admin");
  await withE2EDatabase((sql) => sql`update profiles set last_workspace_id = ${orgId} where id = ${userId}`);
  return orgId;
}

/** Puts a person this run made in a workspace it made. */
export async function addTestMember(orgId: string, userId: string, role: WorkspaceRole): Promise<void> {
  assertLaneRole(role);
  await assertOwnedOrganization(orgId);
  await assertOwnedUser(userId);
  const { test } = await testAuth();
  await test.addMember!({ organizationId: orgId, userId, role });
}

/** Changes a person's role in the workspace. It applies on their next request. */
export async function setTestMemberRole(orgId: string, userId: string, role: WorkspaceRole): Promise<void> {
  assertLaneRole(role);
  await assertOwnedOrganization(orgId);
  const { count } = await withE2EDatabase((sql) => sql`update member set role = ${role} where organization_id = ${orgId} and user_id = ${userId}`);
  if (count !== 1) throw new Error("[e2e] That person isn't in the workspace.");
}

/** Takes a person out of the workspace. It applies on their next request; their Requests and comments stay. */
export async function removeTestMember(orgId: string, userId: string): Promise<void> {
  await assertOwnedOrganization(orgId);
  const { count } = await withE2EDatabase((sql) => sql`delete from member where organization_id = ${orgId} and user_id = ${userId}`);
  if (count !== 1) throw new Error("[e2e] That person isn't in the workspace.");
}
