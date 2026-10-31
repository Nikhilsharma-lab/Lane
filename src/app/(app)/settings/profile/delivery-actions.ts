"use server";

import { revalidatePath } from "next/cache";
import { guardCanContribute } from "@/lib/auth-guard";
import { deliveryPreferenceSchema } from "@/lib/delivery-preference-schema";
import { saveDeliveryChoice } from "@/lib/delivery-preferences";
import { slackConnected } from "@/lib/slack-connection";

/**
 * #206/#207 Settings → Inbox delivery: the signed-in person's choice for this workspace, Email, Slack DM (only
 * while Slack is connected) or Off. The workspace comes from the page; the person and role only from the session.
 */
export async function updateDeliveryPreference(data: { channel: string }, context: { orgId: string }) {
  const parsed = deliveryPreferenceSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose Email, Slack DM or Off." };

  const auth = await guardCanContribute(context.orgId, "You do not have access to this workspace.");
  if ("error" in auth) return auth;
  if (auth.role === "guest") return { error: "Guests get Lane email only about their own submissions, so there is nothing to choose here." };
  if (parsed.data.channel === "slack" && !(await slackConnected(auth.orgId)))
    return { error: "Slack isn't connected to this workspace. Choose Email or Off, or ask an Admin to connect Slack." };

  await saveDeliveryChoice(auth, parsed.data.channel);
  revalidatePath("/settings/profile");
  return { success: true };
}
