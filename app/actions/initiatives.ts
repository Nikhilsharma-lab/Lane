"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { initiatives, initiativeRequests, requests, profiles } from "@/db/schema";
import { and, eq, count, sql } from "drizzle-orm";

async function getAuthedProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  return profile ?? null;
}

export async function createInitiative(data: {
  name: string;
  description?: string;
  color?: string;
}) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  if (!data.name?.trim()) return { error: "Initiative name is required" };

  const [initiative] = await db
    .insert(initiatives)
    .values({
      orgId: profile.orgId,
      name: data.name.trim(),
      description: data.description?.trim() || null,
      color: data.color || "#2E5339",
      createdById: profile.id,
    })
    .returning();

  revalidatePath("/dashboard/initiatives");
  return { success: true, initiativeId: initiative.id };
}

export async function updateInitiative(
  initiativeId: string,
  data: {
    name?: string;
    description?: string;
    color?: string;
    status?: "active" | "completed" | "archived";
  }
) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  const [initiative] = await db
    .select()
    .from(initiatives)
    .where(
      and(
        eq(initiatives.id, initiativeId),
        eq(initiatives.orgId, profile.orgId)
      )
    );
  if (!initiative) return { error: "Initiative not found" };

  await db
    .update(initiatives)
    .set({
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.description !== undefined && {
        description: data.description.trim() || null,
      }),
      ...(data.color !== undefined && { color: data.color }),
      ...(data.status !== undefined && { status: data.status }),
      updatedAt: new Date(),
    })
    .where(eq(initiatives.id, initiativeId));

  revalidatePath("/dashboard/initiatives");
  revalidatePath(`/dashboard/initiatives/${initiativeId}`);
  return { success: true };
}

export async function addRequestToInitiative(
  initiativeId: string,
  requestId: string
) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  const [initiative] = await db
    .select()
    .from(initiatives)
    .where(
      and(
        eq(initiatives.id, initiativeId),
        eq(initiatives.orgId, profile.orgId)
      )
    );
  if (!initiative) return { error: "Initiative not found" };

  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.orgId, profile.orgId)));
  if (!request) return { error: "Request not found" };

  // Check if already added
  const [existing] = await db
    .select()
    .from(initiativeRequests)
    .where(
      and(
        eq(initiativeRequests.initiativeId, initiativeId),
        eq(initiativeRequests.requestId, requestId)
      )
    );
  if (existing) return { error: "Request already in this initiative" };

  await db.insert(initiativeRequests).values({
    initiativeId,
    requestId,
  });

  revalidatePath(`/dashboard/initiatives/${initiativeId}`);
  return { success: true };
}

export async function removeRequestFromInitiative(
  initiativeId: string,
  requestId: string
) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  const [initiative] = await db
    .select()
    .from(initiatives)
    .where(
      and(
        eq(initiatives.id, initiativeId),
        eq(initiatives.orgId, profile.orgId)
      )
    );
  if (!initiative) return { error: "Initiative not found" };

  await db
    .delete(initiativeRequests)
    .where(
      and(
        eq(initiativeRequests.initiativeId, initiativeId),
        eq(initiativeRequests.requestId, requestId)
      )
    );

  revalidatePath(`/dashboard/initiatives/${initiativeId}`);
  return { success: true };
}

export async function getInitiativesForOrg() {
  const profile = await getAuthedProfile();
  if (!profile) return [];

  const allInitiatives = await db
    .select()
    .from(initiatives)
    .where(eq(initiatives.orgId, profile.orgId))
    .orderBy(initiatives.createdAt);

  const initiativeIds = allInitiatives.map((i) => i.id);
  if (initiativeIds.length === 0) return allInitiatives.map((i) => ({ ...i, requestCount: 0 }));

  const countRows = await db
    .select({
      initiativeId: initiativeRequests.initiativeId,
      total: count(),
    })
    .from(initiativeRequests)
    .where(
      sql`${initiativeRequests.initiativeId} IN (${sql.join(
        initiativeIds.map((id) => sql`${id}`),
        sql`, `
      )})`
    )
    .groupBy(initiativeRequests.initiativeId);

  const countMap = Object.fromEntries(
    countRows.map((r) => [r.initiativeId, Number(r.total)])
  );

  return allInitiatives.map((i) => ({
    ...i,
    requestCount: countMap[i.id] ?? 0,
  }));
}
