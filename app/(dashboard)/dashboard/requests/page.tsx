import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, assignments, projects } from "@/db/schema";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { RequestsClient } from "./requests-client";
import type { Project } from "@/db/schema";

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  // All org requests ordered by priority then created_at
  const allRequests = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, profile.orgId))
    .orderBy(
      sql`CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 ELSE 4 END`,
      requests.createdAt
    );

  // Active projects
  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));

  // Assignments for all requests
  const reqIds = allRequests.map((r) => r.id);
  const allAssignments = reqIds.length
    ? await db
        .select({
          requestId: assignments.requestId,
          assigneeId: assignments.assigneeId,
        })
        .from(assignments)
        .where(inArray(assignments.requestId, reqIds))
    : [];

  // Org members for name resolution
  const orgMembers = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));

  const memberMap = Object.fromEntries(
    orgMembers.map((m) => [m.id, m.fullName ?? ""])
  );

  const assigneesByRequest: Record<string, string[]> = {};
  for (const a of allAssignments) {
    if (!assigneesByRequest[a.requestId]) assigneesByRequest[a.requestId] = [];
    const name = memberMap[a.assigneeId];
    if (name) assigneesByRequest[a.requestId].push(name);
  }

  const projectMap = Object.fromEntries(
    activeProjects.map((p) => [p.id, { name: p.name, color: p.color }])
  );

  const resolvedParams = await searchParams;

  return (
    <RequestsClient
      initialRequests={allRequests}
      projects={activeProjects as Project[]}
      projectMap={projectMap}
      assigneesByRequest={assigneesByRequest}
      memberMap={memberMap}
      searchParams={resolvedParams}
    />
  );
}
