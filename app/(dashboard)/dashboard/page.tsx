import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, assignments } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { RequestList } from "@/components/requests/request-list";

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
    .orderBy(requests.createdAt);

  const myAssignments = await db
    .select({ requestId: assignments.requestId })
    .from(assignments)
    .where(eq(assignments.assigneeId, user.id));

  const myRequestIds = new Set(myAssignments.map((a) => a.requestId));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
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
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">{profile.fullName}</span>
          <span className="text-xs text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 capitalize">
            {profile.role}
          </span>
          <form action={logout}>
            <button
              type="submit"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <RequestList requests={allRequests} myRequestIds={myRequestIds} />
      </main>
    </div>
  );
}
