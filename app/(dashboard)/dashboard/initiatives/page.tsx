import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getInitiativesForOrg } from "@/app/actions/initiatives";
import { InitiativeCard } from "@/components/initiatives/initiative-card";
import { CreateInitiativeForm } from "@/components/initiatives/create-initiative-form";
import { EmptyState } from "@/components/ui/empty-state";

export default async function InitiativesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/signup");

  const allInitiatives = await getInitiativesForOrg();

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">
            Initiatives
          </h1>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Group related requests across projects
          </p>
        </div>
        <CreateInitiativeForm />
      </div>

      {allInitiatives.length === 0 ? (
        <EmptyState
          title="No initiatives yet"
          subtitle="Group related requests across projects to track cross-cutting work and strategic themes."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {allInitiatives.map((initiative) => (
            <InitiativeCard
              key={initiative.id}
              id={initiative.id}
              name={initiative.name}
              description={initiative.description}
              color={initiative.color}
              status={initiative.status}
              requestCount={initiative.requestCount}
            />
          ))}
        </div>
      )}
    </main>
  );
}
