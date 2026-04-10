"use server";

import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/db/user";
import { notificationPreferences } from "@/db/schema";
import { eq } from "drizzle-orm";

async function getAuthedUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getNotificationPreferences() {
  const userId = await getAuthedUserId();
  if (!userId) return null;

  return withUserDb(userId, async (db) => {
    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));
    return prefs ?? null;
  });
}

export async function saveNotificationPreferences(data: {
  nudgesInApp?: boolean;
  nudgesEmail?: boolean;
  commentsInApp?: boolean;
  commentsEmail?: boolean;
  stageChangesInApp?: boolean;
  stageChangesEmail?: boolean;
  mentionsInApp?: boolean;
  mentionsEmail?: boolean;
  weeklyDigestEmail?: boolean;
  morningBriefingInApp?: boolean;
}) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [existing] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId));

    if (existing) {
      await db
        .update(notificationPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(notificationPreferences.userId, userId));
    } else {
      await db
        .insert(notificationPreferences)
        .values({ userId, ...data });
    }

    return { success: true };
  });
}
