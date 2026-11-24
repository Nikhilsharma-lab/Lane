import { and, eq, sql } from "drizzle-orm"
import { db, member, profiles } from "@/db"

/** People by id, each with the role their member row holds. Any string, so a test can store a role Lane doesn't know. */
export type Roles = Record<string, string>

/**
 * Puts people in a workspace as Better Auth's member rows (#390). The workspace row must exist. A person without a
 * profile gets one, named by their id; someone already a member takes the new role.
 */
export async function addMembers(orgId: string, roles: Roles) {
  const people = Object.entries(roles)
  if (!people.length) return
  await db.insert(profiles).values(people.map(([id]) => ({ id, fullName: id, email: `${id}@example.test` }))).onConflictDoNothing({ target: profiles.id })
  await db.insert(member)
    .values(people.map(([userId, role]) => ({ id: `${orgId}:${userId}`, organizationId: orgId, userId, role, createdAt: new Date() })))
    .onConflictDoUpdate({ target: [member.organizationId, member.userId], set: { role: sql`excluded.role` } })
}

/** Makes these the workspace's only members, as a test's starting point. */
export async function setMembers(orgId: string, roles: Roles) {
  await db.delete(member).where(eq(member.organizationId, orgId))
  await addMembers(orgId, roles)
}

/** The person leaves the workspace. Their profile stays. */
export async function removeMember(orgId: string, userId: string) {
  await db.delete(member).where(and(eq(member.organizationId, orgId), eq(member.userId, userId)))
}
