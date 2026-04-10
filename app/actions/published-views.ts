"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/db/user";
import { systemDb } from "@/db/system";
import { publishedViews, profiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { ViewFilters } from "@/db/schema/published_views";

async function getAuthedUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function createPublishedView(data: {
  name: string;
  description?: string;
  viewType: string;
  filters: ViewFilters;
  accessMode: "authenticated" | "public";
  allowComments?: boolean;
}) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const publicToken = data.accessMode === "public" ? randomUUID() : null;

    const [view] = await db
      .insert(publishedViews)
      .values({
        orgId: profile.orgId,
        createdById: profile.id,
        name: data.name,
        description: data.description,
        viewType: data.viewType,
        filters: data.filters,
        accessMode: data.accessMode,
        publicToken,
        allowComments: data.allowComments ?? false,
      })
      .returning();

    revalidatePath("/dashboard");
    return { success: true, viewId: view.id, publicToken };
  });
}

// Public-facing read — may be called without a session (public token access).
// Uses systemDb intentionally since anonymous access is gated by token validation.
export async function getPublishedView(viewId: string, token?: string) {
  const [view] = await systemDb
    .select()
    .from(publishedViews)
    .where(and(eq(publishedViews.id, viewId), eq(publishedViews.isActive, true)));

  if (!view) return null;
  if (view.accessMode === "public" && view.publicToken !== token) return null;

  return view;
}
