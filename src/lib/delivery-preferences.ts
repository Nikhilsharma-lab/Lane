import "server-only";

import { and, eq } from "drizzle-orm";

import { db, deliveryPreferences } from "@/db";
import { DEFAULT_DELIVERY_CHOICE, type DeliveryChoice } from "./delivery-preference-rules";

/**
 * #206: a person's delivery choice in a workspace, as Settings shows it. No row is Email. A saved Slack DM
 * (possible only once Slack exists, #207) shows as Email here, which is what it falls back to without Slack.
 */
export async function readDeliveryChoice({ orgId, userId }: { orgId: string; userId: string }): Promise<DeliveryChoice> {
  const [row] = await db
    .select({ channel: deliveryPreferences.channel })
    .from(deliveryPreferences)
    .where(and(eq(deliveryPreferences.orgId, orgId), eq(deliveryPreferences.userId, userId)));
  return row?.channel === "off" ? "off" : DEFAULT_DELIVERY_CHOICE;
}

/** Saves the choice for this person and workspace; the caller has already checked who they are. */
export async function saveDeliveryChoice({ orgId, userId }: { orgId: string; userId: string }, channel: DeliveryChoice) {
  await db
    .insert(deliveryPreferences)
    .values({ orgId, userId, channel, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [deliveryPreferences.orgId, deliveryPreferences.userId], set: { channel, updatedAt: new Date() } });
}
