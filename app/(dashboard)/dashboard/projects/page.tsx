import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, projects, requests } from "@/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";
import { ProjectsClient } from "./projects-client";

export default async function ProjectsPage() {
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

  // Fetch active projects
  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)))
    .orderBy(projects.createdAt);

  // Request counts per project
  const requestCounts = await db
    .select({
      projectId: requests.projectId,
      total: count(),
    })
    .from(requests)
    .where(eq(requests.orgId, profile.orgId))
    .groupBy(requests.projectId);

  const countMap = new Map(
    requestCounts.map((r) => [r.projectId, r.total])
  );

  // Lead names for each project
  const leadIds = [
    ...new Set(
      activeProjects.map((p) => p.leadId).filter(Boolean) as string[]
    ),
  ];
  const leadProfiles =
    leadIds.length > 0
      ? await db
          .select({ id: profiles.id, fullName: profiles.fullName })
          .from(profiles)
          .where(eq(profiles.orgId, profile.orgId))
      : [];
  const leadMap = new Map(leadProfiles.map((p) => [p.id, p.fullName ?? null]));

  const projectsWithMeta = activeProjects.map((p) => ({
    ...p,
    requestCount: countMap.get(p.id) ?? 0,
    leadName: p.leadId ? (leadMap.get(p.leadId) ?? null) : null,
  }));

  const canCreate = ["admin", "lead", "pm"].includes(profile.role ?? "");

  return (
    <ProjectsClient projects={projectsWithMeta} canCreate={canCreate} />
  );
}
