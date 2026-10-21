import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { reviewerKey, type ReviewerIdentity } from "./request-reviewer-rules";
export type WorkspacePerson = { nominee: ReviewerIdentity; name: string; email: string; role?: string };
/** Fresh provider data, never a Lane membership registry. */
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
export async function pendingInvitations(
  orgId: string,
): Promise<WorkspacePerson[]> {
  const client = await clerkClient();
  const people: WorkspacePerson[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await client.organizations.getOrganizationInvitationList({
      organizationId: orgId,
      status: ["pending"],
      limit: 100,
      offset,
    });
    for (const invitation of page.data)
      if (
        invitation.organizationId === orgId &&
        invitation.status === "pending" &&
        ["org:member", "org:admin"].includes(invitation.role)
      )
        people.push({
          nominee: {
            kind: "invitation",
            invitationId: invitation.id,
            email: invitation.emailAddress.toLowerCase(),
          },
          name: invitation.emailAddress,
          email: invitation.emailAddress.toLowerCase(),
        });
    if (offset + page.data.length >= page.totalCount) break;
    if (!page.data.length)
      throw new Error("Could not verify pending invitations. Try again.");
  }
  return people;
}
export async function resolveInvitedMember(
  orgId: string,
  nominee: ReviewerIdentity,
  userId: string,
) {
  if (nominee.kind !== "invitation") return false;
  const client = await clerkClient();
  const [invitation, user] = await Promise.all([
    client.organizations.getOrganizationInvitation({
      organizationId: orgId,
      invitationId: nominee.invitationId,
    }),
    client.users.getUser(userId),
  ]);
  return (
    invitation.organizationId === orgId &&
    invitation.status === "accepted" &&
    invitation.emailAddress.toLowerCase() === nominee.email.toLowerCase() &&
    user.emailAddresses.some(
      (e) =>
        e.verification?.status === "verified" &&
        e.emailAddress.toLowerCase() === nominee.email.toLowerCase(),
    )
  );
}
export async function invitationState(
  orgId: string,
  nominee: Extract<ReviewerIdentity, { kind: "invitation" }>,
) {
  const client = await clerkClient();
  const invitation = await client.organizations.getOrganizationInvitation({
    organizationId: orgId,
    invitationId: nominee.invitationId,
  });
  if (
    invitation.organizationId !== orgId ||
    invitation.emailAddress.toLowerCase() !== nominee.email.toLowerCase()
  )
    return "unavailable";
  return invitation.status;
}
/** An invitation may target a member's secondary verified email. */
export async function distinctPeople(people: WorkspacePerson[]) {
  if (new Set(people.map((p) => reviewerKey(p.nominee))).size !== people.length)
    return false;
  const invitations = people
    .filter((p) => p.nominee.kind === "invitation")
    .map((p) => p.email.toLowerCase());
  if (new Set(invitations).size !== invitations.length) return false;
  if (!invitations.length) return true;
  const client = await clerkClient();
  const members = await Promise.all(
    people.flatMap((p) =>
      p.nominee.kind === "member"
        ? [client.users.getUser(p.nominee.userId)]
        : [],
    ),
  );
  return !members.some((user) =>
    user.emailAddresses.some(
      (e) =>
        e.verification?.status === "verified" &&
        invitations.includes(e.emailAddress.toLowerCase()),
    ),
  );
}
