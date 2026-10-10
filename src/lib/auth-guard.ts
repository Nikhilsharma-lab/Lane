import { auth } from "@clerk/nextjs/server";

export type WorkspacePermission = "admin" | "member" | "guest";
export type MemberAuth = {
  userId: string;
  orgId: string;
  role: WorkspacePermission;
};
export type AdminAuth = MemberAuth & { role: "admin" };

export function clerkWorkspacePermission(orgRole: string | null | undefined) {
  if (orgRole === "org:admin") return "admin" as const;
  if (orgRole === "org:member") return "member" as const;
  if (orgRole === "org:guest") return "guest" as const;
  return null;
}

async function activeClerkMembership(
  expectedOrgId: string
): Promise<MemberAuth | null> {
  const { userId, orgId, orgRole } = await auth();
  const role = clerkWorkspacePermission(orgRole);

  if (!userId || !orgId || orgId !== expectedOrgId || !role) return null;

  return { userId, orgId, role };
}

export async function requireActiveMember(
  orgId: string
): Promise<MemberAuth | null> {
  return activeClerkMembership(orgId);
}

export async function requireMemberOrAbove(
  orgId: string
): Promise<MemberAuth | null> {
  const membership = await activeClerkMembership(orgId);
  if (!membership || membership.role === "guest") return null;
  return membership;
}

export async function requireOwnerOrAdmin(
  orgId: string
): Promise<AdminAuth | null> {
  const membership = await activeClerkMembership(orgId);
  if (!membership || membership.role !== "admin") return null;
  return { ...membership, role: "admin" };
}
