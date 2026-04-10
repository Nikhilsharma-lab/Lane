"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { iterations, iterationComments, profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

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

export async function createIteration(data: {
  requestId: string;
  title: string;
  description?: string;
  figmaUrl?: string;
  stage: "sense" | "frame" | "diverge" | "converge" | "prove";
}) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  await db.insert(iterations).values({
    requestId: data.requestId,
    authorId: profile.id,
    title: data.title,
    description: data.description ?? null,
    figmaUrl: data.figmaUrl ?? null,
    stage: data.stage,
  });

  revalidatePath(`/dashboard/requests/${data.requestId}`);
  return { success: true };
}

export async function getIterationsForRequest(requestId: string) {
  return db
    .select()
    .from(iterations)
    .where(eq(iterations.requestId, requestId))
    .orderBy(iterations.sortOrder, iterations.createdAt);
}

export async function addIterationComment(data: {
  iterationId: string;
  body: string;
  parentId?: string | null;
}) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  await db.insert(iterationComments).values({
    iterationId: data.iterationId,
    authorId: profile.id,
    body: data.body,
    parentId: data.parentId ?? null,
  });

  return { success: true };
}

export async function getIterationComments(iterationId: string) {
  return db
    .select({
      id: iterationComments.id,
      iterationId: iterationComments.iterationId,
      authorId: iterationComments.authorId,
      parentId: iterationComments.parentId,
      body: iterationComments.body,
      createdAt: iterationComments.createdAt,
      authorName: profiles.fullName,
    })
    .from(iterationComments)
    .leftJoin(profiles, eq(iterationComments.authorId, profiles.id))
    .where(eq(iterationComments.iterationId, iterationId))
    .orderBy(iterationComments.createdAt);
}
