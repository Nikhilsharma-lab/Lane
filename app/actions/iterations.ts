"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/db/user";
import { iterations, iterationComments, profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

async function getAuthedUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function createIteration(data: {
  requestId: string;
  title: string;
  description?: string;
  figmaUrl?: string;
  rationale?: string;
  stage: "sense" | "frame" | "diverge" | "converge" | "prove";
}) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    await db.insert(iterations).values({
      requestId: data.requestId,
      authorId: userId,
      title: data.title,
      description: data.description ?? null,
      figmaUrl: data.figmaUrl ?? null,
      rationale: data.rationale ?? null,
      stage: data.stage,
    });

    revalidatePath(`/dashboard/requests/${data.requestId}`);
    return { success: true };
  });
}

export async function updateIteration(data: {
  iterationId: string;
  requestId: string;
  title?: string;
  description?: string;
  figmaUrl?: string;
  rationale?: string;
}) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    await db
      .update(iterations)
      .set({
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.figmaUrl !== undefined && { figmaUrl: data.figmaUrl }),
        ...(data.rationale !== undefined && { rationale: data.rationale }),
        updatedAt: new Date(),
      })
      .where(eq(iterations.id, data.iterationId));

    revalidatePath(`/dashboard/requests/${data.requestId}`);
    return { success: true };
  });
}

export async function getIterationsForRequest(requestId: string) {
  const userId = await getAuthedUserId();
  if (!userId) return [];

  return withUserDb(userId, async (db) => {
    return db
      .select()
      .from(iterations)
      .where(eq(iterations.requestId, requestId))
      .orderBy(iterations.sortOrder, iterations.createdAt);
  });
}

export async function addIterationComment(data: {
  iterationId: string;
  body: string;
  parentId?: string | null;
}) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    await db.insert(iterationComments).values({
      iterationId: data.iterationId,
      authorId: userId,
      body: data.body,
      parentId: data.parentId ?? null,
    });

    return { success: true };
  });
}

export async function getIterationComments(iterationId: string) {
  const userId = await getAuthedUserId();
  if (!userId) return [];

  return withUserDb(userId, async (db) => {
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
  });
}
