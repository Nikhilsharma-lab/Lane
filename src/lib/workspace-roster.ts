import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { ReviewerIdentity } from "./request-reviewer-rules";
export type WorkspacePerson = { nominee: ReviewerIdentity; name: string; email: string; role?: string };
/**
 * The workspace's Admins and Members: the paid seats, and the only people who
 * can be Reviewers (#211). Guests and Viewers are left out. Fresh provider
 * data, never a Lane membership registry.
 */
export async function workspaceRoster(
  orgId: string,
): Promise<WorkspacePerson[]> {
  const client = await clerkClient();
  const people: WorkspacePerson[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
      offset,
    });
    for (const m of page.data) {
      const u = m.publicUserData;
      if (
        m.organization.id === orgId &&
        ["org:admin", "org:member"].includes(m.role) &&
        u?.userId
      )
        people.push({
          nominee: { kind: "member", userId: u.userId },
          role: m.role,
          email: (u.identifier ?? "").toLowerCase(),
          name:
            [u.firstName, u.lastName].filter(Boolean).join(" ") ||
            u.identifier ||
            u.userId,
        });
    }
    if (offset + page.data.length >= page.totalCount) break;
    if (!page.data.length)
      throw new Error("Could not verify workspace members. Try again.");
  }
  return people;
}
/** One person's live membership of the workspace, any role, or null once they have left (#212). */
export async function workspaceMember(orgId: string, userId: string): Promise<{ role: string; email: string } | null> {
  const client = await clerkClient();
  const page = await client.organizations.getOrganizationMembershipList({ organizationId: orgId, userId: [userId], limit: 1 });
  const membership = page.data.find((m) => m.organization.id === orgId && m.publicUserData?.userId === userId);
  return membership ? { role: membership.role, email: (membership.publicUserData?.identifier ?? "").toLowerCase() } : null;
}
