import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  getCurrentUserWorkspaceRole,
  getUserTeamsForSidebar,
  getPersonalZoneCounts,
} from "@/lib/queries/nav";
import type { SidebarData } from "@/lib/nav/types";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const workspaceId = profile.orgId;

  const [wsRole, teamsData, personalCounts] = await Promise.all([
    getCurrentUserWorkspaceRole(user.id, workspaceId),
    getUserTeamsForSidebar(user.id, workspaceId),
    getPersonalZoneCounts(user.id, workspaceId),
  ]);

  if (!wsRole) {
    return NextResponse.json(
      { error: "Not a workspace member" },
      { status: 403 },
    );
  }

  const data: SidebarData = {
    workspace: {
      id: wsRole.workspaceId,
      name: wsRole.workspaceName,
      slug: wsRole.workspaceSlug,
      role: wsRole.role,
    },
    personal: personalCounts,
    teams: teamsData,
    user: {
      id: user.id,
      fullName: profile.fullName,
      email: profile.email,
    },
  };

  return NextResponse.json(data);
}
