import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/db/user";
import { profiles, requests } from "@/db/schema";
import type { Phase } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { CompactRequestRow } from "@/components/dashboard/request-card";
import { PhaseFilter } from "@/components/requests/phase-filter";

const VALID_PHASES: readonly Phase[] = ["predesign", "design", "dev", "track"];

// Canonical user-facing labels per CLAUDE.md Part 1. "dev" → "build".
const PHASE_LABEL: Record<Phase, string> = {
  predesign: "predesign",
  design: "design",
  dev: "build",
  track: "track",
};

export default async function MyRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Phase filter from URL
  const resolvedParams = await searchParams;
  const rawPhase =
    typeof resolvedParams.phase === "string" ? resolvedParams.phase : undefined;
  const activePhase = VALID_PHASES.find((p) => p === rawPhase) ?? null;

  // All DB access runs inside a user-scoped session so RLS policies apply.
  // App-layer org/owner filters remain as defense-in-depth per rls-audit.md.
  const { profile, myRequests } = await withUserDb(user.id, async (db) => {
    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, user.id));

    if (!profile) {
      return {
        profile: null as typeof profiles.$inferSelect | null,
        myRequests: [] as (typeof requests.$inferSelect)[],
      };
    }

    const conditions = [
      eq(requests.designerOwnerId, profile.id),
      eq(requests.orgId, profile.orgId),
    ];
    if (activePhase) {
      conditions.push(eq(requests.phase, activePhase));
    }

    const myRequests = await db
      .select()
      .from(requests)
      .where(and(...conditions))
      .orderBy(desc(requests.updatedAt));

    return { profile, myRequests };
  });

  if (!profile) redirect("/login");

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">My requests</h1>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Requests where you&apos;re the designer owner.
        </p>
      </div>

      <PhaseFilter activePhase={activePhase} />

      {myRequests.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {activePhase
              ? `No requests in the ${PHASE_LABEL[activePhase]} phase right now.`
              : "You\u2019re clear. Time to think, learn, or help a teammate."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {myRequests.map((request) => (
            <CompactRequestRow
              key={request.id}
              request={request}
              firstAssigneeName={undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
