import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  initiatives,
  initiativeRequests,
  requests,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { InitiativeDetail } from "@/components/initiatives/initiative-detail";

export default async function InitiativeDetailPage({
  params,
}: {
  params: { id: string };
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
  if (!profile) redirect("/signup");

  const [initiative] = await db
    .select()
    .from(initiatives)
    .where(
      and(
        eq(initiatives.id, params.id),
        eq(initiatives.orgId, profile.orgId)
      )
    );
  if (!initiative) notFound();

  // Get requests in this initiative
  const irRows = await db
    .select({ requestId: initiativeRequests.requestId })
    .from(initiativeRequests)
    .where(eq(initiativeRequests.initiativeId, initiative.id));

  const requestIds = irRows.map((r) => r.requestId);

  const initReqs = requestIds.length
    ? await db
        .select({
          id: requests.id,
          title: requests.title,
          phase: requests.phase,
          priority: requests.priority,
        })
        .from(requests)
        .where(inArray(requests.id, requestIds))
    : [];

  // All org requests for "add request" search
  const allOrgRequests = await db
    .select({ id: requests.id, title: requests.title })
    .from(requests)
    .where(eq(requests.orgId, profile.orgId));

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <InitiativeDetail
        initiative={{
          id: initiative.id,
          name: initiative.name,
          description: initiative.description,
          color: initiative.color,
          status: initiative.status,
        }}
        requests={initReqs}
        orgRequests={allOrgRequests}
      />
    </main>
  );
}
