"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { cycles, cycleRequests, requests, profiles, projects } from "@/db/schema";
import { and, eq, count, sql } from "drizzle-orm";
import { addWeeks } from "date-fns";

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

export async function createCycle(data: {
  projectId: string;
  name: string;
  appetiteWeeks: number;
  startsAt: string;
}) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  if (!data.name?.trim()) return { error: "Cycle name is required" };
  if (!data.projectId) return { error: "Project is required" };
  if (!data.appetiteWeeks || data.appetiteWeeks < 1)
    return { error: "Appetite must be at least 1 week" };

  // Verify project belongs to org
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, data.projectId), eq(projects.orgId, profile.orgId))
    );
  if (!project) return { error: "Project not found" };

  const startsAt = new Date(data.startsAt);
  const endsAt = addWeeks(startsAt, data.appetiteWeeks);

  const [cycle] = await db
    .insert(cycles)
    .values({
      orgId: profile.orgId,
      projectId: data.projectId,
      name: data.name.trim(),
      appetiteWeeks: data.appetiteWeeks,
      startsAt,
      endsAt,
      createdById: profile.id,
    })
    .returning();

  revalidatePath("/dashboard/cycles");
  revalidatePath("/dashboard");
  return { success: true, cycleId: cycle.id };
}

export async function updateCycleStatus(
  cycleId: string,
  status: "draft" | "active" | "completed" | "cancelled"
) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  const [cycle] = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.id, cycleId), eq(cycles.orgId, profile.orgId)));
  if (!cycle) return { error: "Cycle not found" };

  // When activating, validate no other active cycle for the same project
  if (status === "active") {
    const [existingActive] = await db
      .select({ id: cycles.id })
      .from(cycles)
      .where(
        and(
          eq(cycles.projectId, cycle.projectId),
          eq(cycles.status, "active"),
          sql`${cycles.id} != ${cycleId}`
        )
      )
      .limit(1);

    if (existingActive) {
      return {
        error:
          "This project already has an active cycle. Complete or cancel it first.",
      };
    }
  }

  await db
    .update(cycles)
    .set({ status, updatedAt: new Date() })
    .where(eq(cycles.id, cycleId));

  revalidatePath("/dashboard/cycles");
  revalidatePath(`/dashboard/cycles/${cycleId}`);
  return { success: true };
}

export async function addRequestToCycle(cycleId: string, requestId: string) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  const [cycle] = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.id, cycleId), eq(cycles.orgId, profile.orgId)));
  if (!cycle) return { error: "Cycle not found" };

  const [request] = await db
    .select()
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.orgId, profile.orgId)));
  if (!request) return { error: "Request not found" };

  // Check if already added
  const [existing] = await db
    .select()
    .from(cycleRequests)
    .where(
      and(
        eq(cycleRequests.cycleId, cycleId),
        eq(cycleRequests.requestId, requestId)
      )
    );
  if (existing) return { error: "Request already in this cycle" };

  await db.insert(cycleRequests).values({
    cycleId,
    requestId,
    addedById: profile.id,
  });

  revalidatePath(`/dashboard/cycles/${cycleId}`);
  return { success: true };
}

export async function removeRequestFromCycle(
  cycleId: string,
  requestId: string
) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  const [cycle] = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.id, cycleId), eq(cycles.orgId, profile.orgId)));
  if (!cycle) return { error: "Cycle not found" };

  await db
    .delete(cycleRequests)
    .where(
      and(
        eq(cycleRequests.cycleId, cycleId),
        eq(cycleRequests.requestId, requestId)
      )
    );

  revalidatePath(`/dashboard/cycles/${cycleId}`);
  return { success: true };
}

export async function getCyclesForOrg() {
  const profile = await getAuthedProfile();
  if (!profile) return [];

  const allCycles = await db
    .select({
      id: cycles.id,
      name: cycles.name,
      status: cycles.status,
      appetiteWeeks: cycles.appetiteWeeks,
      startsAt: cycles.startsAt,
      endsAt: cycles.endsAt,
      projectId: cycles.projectId,
      createdAt: cycles.createdAt,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(cycles)
    .leftJoin(projects, eq(cycles.projectId, projects.id))
    .where(eq(cycles.orgId, profile.orgId))
    .orderBy(cycles.createdAt);

  // Get request counts per cycle
  const cycleIds = allCycles.map((c) => c.id);
  if (cycleIds.length === 0) return [];

  const countRows = await db
    .select({
      cycleId: cycleRequests.cycleId,
      total: count(),
    })
    .from(cycleRequests)
    .where(sql`${cycleRequests.cycleId} IN (${sql.join(cycleIds.map((id) => sql`${id}`), sql`, `)})`)
    .groupBy(cycleRequests.cycleId);

  const countMap = Object.fromEntries(
    countRows.map((r) => [r.cycleId, Number(r.total)])
  );

  // Get completed counts per cycle (phase = 'track' or kanbanState = 'done')
  const completedRows = await db
    .select({
      cycleId: cycleRequests.cycleId,
      completed: count(),
    })
    .from(cycleRequests)
    .innerJoin(requests, eq(cycleRequests.requestId, requests.id))
    .where(
      and(
        sql`${cycleRequests.cycleId} IN (${sql.join(cycleIds.map((id) => sql`${id}`), sql`, `)})`,
        sql`(${requests.phase} = 'track' OR (${requests.phase} = 'dev' AND ${requests.kanbanState} = 'done'))`
      )
    )
    .groupBy(cycleRequests.cycleId);

  const completedMap = Object.fromEntries(
    completedRows.map((r) => [r.cycleId, Number(r.completed)])
  );

  return allCycles.map((c) => ({
    ...c,
    requestCount: countMap[c.id] ?? 0,
    completedCount: completedMap[c.id] ?? 0,
  }));
}
