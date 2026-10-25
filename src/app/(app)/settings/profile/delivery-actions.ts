"use server";

import { revalidatePath } from "next/cache";
import { requireActiveMember, refusal } from "@/lib/auth-guard";
import { deliveryPreferenceSchema } from "@/lib/delivery-preference-rules";
import { saveDeliveryChoice } from "@/lib/delivery-preferences";

/**
 * #206 Settings → Inbox delivery: the signed-in person's choice for this workspace, Email or Off. The
 * workspace comes from the page; the person and role only from the session.
 */
export async function updateDeliveryPreference(data: { channel: string }, context: { orgId: string }) {
  const parsed = deliveryPreferenceSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose Email or Off." };

  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("You do not have access to this workspace.") };
  if (auth.role === "guest") return { error: "Guests get Lane email only about their own submissions, so there is nothing to choose here." };

  await saveDeliveryChoice({ orgId: auth.orgId, userId: auth.userId }, parsed.data.channel);
  revalidatePath("/settings/profile");
  return { success: true };
}
