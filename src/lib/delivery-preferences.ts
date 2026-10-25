import "server-only";

import { and, eq } from "drizzle-orm";

import { db, deliveryPreferences } from "@/db";
import { DEFAULT_DELIVERY_CHOICE, type DeliveryChoice } from "./delivery-preference-rules";
import { slackConnected } from "./slack-connection";

export type DeliveryState = {
  /** What the person's items go by now. A saved Slack DM shows as Email while Slack is not connected. */
  choice: DeliveryChoice;
  /** Whether Slack DM can be chosen: Slack is connected to this workspace (#207). */
  slackOffered: boolean;
  /** The saved choice is Slack DM, even if it falls back to Email right now. */
  choseSlack: boolean;
};

/**
 * #206/#207: a person's delivery choice in a workspace, as Settings shows it. No row is Email. A saved Slack DM
 * stays saved when Slack is disconnected, and items go by Email until Slack is connected again.
 */
export async function readDeliveryState({ orgId, userId }: { orgId: string; userId: string }): Promise<DeliveryState> {
  const [[row], slackOffered] = await Promise.all([
    db
      .select({ channel: deliveryPreferences.channel })
      .from(deliveryPreferences)
      .where(and(eq(deliveryPreferences.orgId, orgId), eq(deliveryPreferences.userId, userId))),
    slackConnected(orgId),
  ]);
  const saved = row?.channel ?? DEFAULT_DELIVERY_CHOICE;
  const choice = saved === "slack" && !slackOffered ? "email" : saved;
  return { choice, slackOffered, choseSlack: saved === "slack" };
}

export async function readDeliveryChoice(person: { orgId: string; userId: string }): Promise<DeliveryChoice> {
  return (await readDeliveryState(person)).choice;
}

/** Saves the choice for this person and workspace; the caller has already checked who they are. */
export async function saveDeliveryChoice({ orgId, userId }: { orgId: string; userId: string }, channel: DeliveryChoice) {
  await db
    .insert(deliveryPreferences)
    .values({ orgId, userId, channel, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [deliveryPreferences.orgId, deliveryPreferences.userId], set: { channel, updatedAt: new Date() } });
}
