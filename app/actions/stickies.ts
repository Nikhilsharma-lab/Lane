"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/db/user";
import { stickies, profiles } from "@/db/schema";
import { and, eq, isNull, desc } from "drizzle-orm";

async function getAuthedUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function createSticky(data: {
  content: string;
  color?: string;
  requestId?: string | null;
}) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    await db.insert(stickies).values({
      orgId: profile.orgId,
      authorId: profile.id,
      content: data.content,
      color: data.color ?? "cream",
      requestId: data.requestId ?? null,
    });

    revalidatePath("/dashboard/stickies");
    return { success: true };
  });
}

export async function updateSticky(
  stickyId: string,
  data: {
    content?: string;
    color?: string;
    isPinned?: boolean;
    requestId?: string | null;
  }
) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    await db
      .update(stickies)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(stickies.id, stickyId), eq(stickies.authorId, userId)));

    revalidatePath("/dashboard/stickies");
    return { success: true };
  });
}

export async function archiveSticky(stickyId: string) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    await db
      .update(stickies)
      .set({ archivedAt: new Date() })
      .where(and(eq(stickies.id, stickyId), eq(stickies.authorId, userId)));

    revalidatePath("/dashboard/stickies");
    return { success: true };
  });
}

export async function getMyStickies() {
  const userId = await getAuthedUserId();
  if (!userId) return [];

  return withUserDb(userId, async (db) => {
    return db
      .select()
      .from(stickies)
      .where(and(eq(stickies.authorId, userId), isNull(stickies.archivedAt)))
      .orderBy(desc(stickies.isPinned), desc(stickies.createdAt));
  });
}
