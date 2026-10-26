import "server-only";

import { eq } from "drizzle-orm";

import { db, profiles, slackConnections } from "@/db";
import type { WorkspacePerson } from "./auth-guard";
import { slackDelivery, type SlackDelivery } from "./feature-switches";
import { openSlackToken, sealSlackToken } from "./slack-token";

/**
 * #207: a workspace's Slack connection. An Admin makes it once (Slack's install flow ends in `saveSlackConnection`)
 * and can remove it. Slack counts as connected only while the Slack switch is on AND a connection is saved; with
 * the switch off nothing reads the token and nobody is offered Slack DM. Access is the caller's job: actions and
 * the callback guard the Admin first. The token never leaves this module except to the Slack adapters.
 */

export type SlackConnectionView = { teamName: string; connectedAt: Date; connectedByName: string | null };

/** What Settings shows about the connection; never the token. */
export async function readSlackConnection(orgId: string): Promise<SlackConnectionView | null> {
  const [row] = await db
    .select({ teamName: slackConnections.teamName, connectedAt: slackConnections.connectedAt, connectedByName: profiles.fullName })
    .from(slackConnections)
    .leftJoin(profiles, eq(profiles.id, slackConnections.connectedBy))
    .where(eq(slackConnections.orgId, orgId));
  return row ? { teamName: row.teamName, connectedAt: row.connectedAt, connectedByName: row.connectedByName?.trim() || null } : null;
}

/** Whether people in this workspace can get Slack DMs right now. */
export async function slackConnected(orgId: string, slack: SlackDelivery = slackDelivery()): Promise<boolean> {
  if (!slack.on) return false;
  const [row] = await db.select({ orgId: slackConnections.orgId }).from(slackConnections).where(eq(slackConnections.orgId, orgId));
  return !!row;
}

/** The workspace's bot token, opened, or null when Slack is off, not connected, or the token won't open. */
export async function slackTokenFor(orgId: string, slack: SlackDelivery = slackDelivery()): Promise<string | null> {
  if (!slack.on) return null;
  const [row] = await db.select({ sealed: slackConnections.tokenCiphertext }).from(slackConnections).where(eq(slackConnections.orgId, orgId));
  if (!row) return null;
  const token = openSlackToken(row.sealed, { key: slack.tokenKey, orgId });
  if (!token) console.error("[slack] a saved Slack token did not open; Slack DMs fall back to Email until an Admin connects again");
  return token;
}

/** Saves (or replaces) the workspace's connection, sealing the token first. */
export async function saveSlackConnection(
  { orgId, userId }: WorkspacePerson,
  install: { token: string; teamId: string; teamName: string },
  { tokenKey }: { tokenKey: Buffer },
) {
  const values = {
    teamId: install.teamId,
    teamName: install.teamName.trim().slice(0, 200) || install.teamId,
    tokenCiphertext: sealSlackToken(install.token, { key: tokenKey, orgId }),
    connectedBy: userId,
    connectedAt: new Date(),
  };
  await db.insert(slackConnections).values({ orgId, ...values }).onConflictDoUpdate({ target: slackConnections.orgId, set: values });
}

/** Removes the connection. Returns the opened token (when the switch can open it) so the caller can revoke it. */
export async function removeSlackConnection(orgId: string, slack: SlackDelivery = slackDelivery()): Promise<string | null> {
  const [row] = await db.delete(slackConnections).where(eq(slackConnections.orgId, orgId)).returning({ sealed: slackConnections.tokenCiphertext });
  if (!row || !slack.on) return null;
  return openSlackToken(row.sealed, { key: slack.tokenKey, orgId });
}
