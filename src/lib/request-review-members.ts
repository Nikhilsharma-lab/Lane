import { clerkClient } from "@clerk/nextjs/server";
import { inArray } from "drizzle-orm";
import { db, profiles } from "@/db";
import { clerkWorkspacePermission } from "@/lib/auth-guard";
import { ReviewRuleError, type ReviewPerson } from "@/lib/request-review";

export type ReviewMember = ReviewPerson & { role: "admin" | "member" };

/** Clerk owns eligibility; a Lane profile confirms that the member has onboarded. */
export async function getRequestReviewMembers(orgId: string, options: { query?: string; userIds?: string[] } = {}): Promise<ReviewMember[]> {
  if (options.userIds?.length === 0) return [];
  const client = await clerkClient();
  const result = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    role: ["org:admin", "org:member"],
    userId: options.userIds,
    query: options.query || undefined,
    limit: 100,
    offset: 0,
  });
  // The free pilot is small. Never silently present an incomplete large roster.
  if (result.totalCount > result.data.length) throw new ReviewRuleError("Type a more specific name to find a reviewer");
  const memberships = result.data.filter(item => {
    const role = clerkWorkspacePermission(item.role);
    const id = item.publicUserData?.userId;
    return item.organization.id === orgId && id && (role === "admin" || role === "member")
      && (!options.userIds || options.userIds.includes(id));
  });
  const ids = [...new Set(memberships.map(item => item.publicUserData!.userId))];
  if (!ids.length) return [];
  const onboarded = await db.select({ id: profiles.id, name: profiles.fullName }).from(profiles).where(inArray(profiles.id, ids));
  const people = new Map(onboarded.map(person => [person.id, person]));
  const members = new Map<string, ReviewMember>();
  for (const membership of memberships) {
    const user = membership.publicUserData!;
    const person = people.get(user.userId);
    if (!person) continue;
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || person.name.trim();
    if (!name) continue;
    members.set(person.id, { id: person.id, name, role: membership.role === "org:admin" ? "admin" : "member" });
  }
  return [...members.values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
