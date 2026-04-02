import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, assignments } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { RequestList } from "@/components/requests/request-list";
import { UserMenu } from "@/components/settings/user-menu";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { RealtimeDashboard } from "@/components/realtime/realtime-dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/signup");

  const allRequests = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, profile.orgId))
    .orderBy(
      sql`CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 ELSE 4 END`,
      requests.createdAt
    );

  const myAssignments = await db
    .select({ requestId: assignments.requestId })
    .from(assignments)
    .where(eq(assignments.assigneeId, user.id));

  const myRequestIds = new Set(myAssignments.map((a) => a.requestId));

  // Assignee avatars per request for the list
  const orgReqIds = allRequests.map((r) => r.id);
  const allAssignments = orgReqIds.length
    ? await db
        .select({ requestId: assignments.requestId, assigneeId: assignments.assigneeId })
        .from(assignments)
        .where(inArray(assignments.requestId, orgReqIds))
    : [];

  const orgMembers = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));

  const memberMap = Object.fromEntries(orgMembers.map((m) => [m.id, m.fullName]));

  // requestId → array of assignee names
  const assigneesByRequest: Record<string, string[]> = {};
  for (const a of allAssignments) {
    if (!assigneesByRequest[a.requestId]) assigneesByRequest[a.requestId] = [];
    const name = memberMap[a.assigneeId];
    if (name) assigneesByRequest[a.requestId].push(name);
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <RealtimeDashboard orgId={profile.orgId} />
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold">DesignQ</span>
          <span className="text-zinc-700">·</span>
          <nav className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className="text-sm text-white bg-zinc-800 px-2 py-1 rounded transition-colors"
            >
              Requests
            </Link>
            <Link
              href="/dashboard/team"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Team
            </Link>
            <Link
              href="/dashboard/insights"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Insights
            </Link>
            <Link
              href="/dashboard/ideas"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Ideas
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <NotificationsBell />
          <span className="text-xs text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 capitalize">
            {profile.role}
          </span>
          <UserMenu fullName={profile.fullName} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <RequestList requests={allRequests} myRequestIds={myRequestIds} assigneesByRequest={assigneesByRequest} />
      </main>
    </div>
  );
}
