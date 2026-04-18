"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/db/user";
import { requests } from "@/db/schema";
import { eq } from "drizzle-orm";

async function getAuthedUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function saveSensingSummary(requestId: string, sensingSummary: string) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    await db
      .update(requests)
      .set({ sensingSummary })
      .where(eq(requests.id, requestId));

    revalidatePath(`/dashboard/requests/${requestId}`);
    return { success: true };
  });
}

export async function saveDesignFrame(
  requestId: string,
  frame: {
    problem: string;
    successCriteria: string;
    constraints: string;
    divergence: string;
  },
) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    await db
      .update(requests)
      .set({
        designFrameProblem: frame.problem,
        designFrameSuccessCriteria: frame.successCriteria,
        designFrameConstraints: frame.constraints,
        designFrameDivergence: frame.divergence,
      })
      .where(eq(requests.id, requestId));

    revalidatePath(`/dashboard/requests/${requestId}`);
    return { success: true };
  });
}
