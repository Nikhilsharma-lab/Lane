import { createClient } from "@/lib/supabase/server";
import { db, workspaceMembers } from "@/db";
import { eq, and } from "drizzle-orm";

export type MemberAuth = { userId: string; orgId: string };
export type AdminAuth = MemberAuth & { role: string };

export async function requireActiveMember(
  orgId: string
): Promise<MemberAuth | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, orgId),
        eq(workspaceMembers.userId, user.id),
        eq(workspaceMembers.isActive, true)
      )
    );
  if (!row) return null;
  return { userId: user.id, orgId };
}

export async function requireMemberOrAbove(
  orgId: string
): Promise<MemberAuth | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, orgId),
        eq(workspaceMembers.userId, user.id),
        eq(workspaceMembers.isActive, true)
      )
    );
  if (!row || row.role === "guest") return null;
  return { userId: user.id, orgId };
}

export async function requireOwnerOrAdmin(
  orgId: string
): Promise<AdminAuth | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [row] = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, orgId),
        eq(workspaceMembers.userId, user.id),
        eq(workspaceMembers.isActive, true)
      )
    );
  if (!row || (row.role !== "owner" && row.role !== "admin")) return null;
  return { userId: user.id, orgId, role: row.role };
}
