import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, projects } from "@/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { ProjectList } from "@/components/settings/project-list";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));

  const archivedProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNotNull(projects.archivedAt)));

  return (
    <div className="max-w-lg space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-white mb-1">Projects</h1>
        <p className="text-sm text-zinc-500">Organise requests into product lines or initiatives.</p>
      </div>
      <ProjectList activeProjects={activeProjects} archivedProjects={archivedProjects} />
    </div>
  );
}
