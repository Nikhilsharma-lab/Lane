"use server";

import { revalidatePath } from "next/cache";
import { guardOwnerOrAdmin } from "@/lib/auth-guard";
import { appOrigin, slackDelivery } from "@/lib/feature-switches";
import { removeSlackConnection } from "@/lib/slack-connection";
import { revokeSlackToken, signInstallState, slackAuthorizeUrl } from "@/lib/slack-install";

/**
 * #207 Settings → Slack (Admins only). Connecting starts Slack's standard install flow: this returns Slack's
 * install page, with a signed state naming this workspace and Admin, and `GET /api/slack/callback` finishes it.
 * Disconnecting removes the connection; people who chose Slack DM get Email from then on. The workspace comes
 * from the page; the person and role only from the session. While the Slack switch is off nothing is offered.
 */

export async function startSlackConnect(_data: Record<string, never>, context: { orgId: string }) {
  const auth = await guardOwnerOrAdmin(context.orgId, "Only Admins can connect Slack to this workspace.");
  if ("error" in auth) return auth;
  const slack = slackDelivery();
  if (!slack.on) return { error: "Slack isn't available in Lane yet." };

  const state = signInstallState(auth, { secret: slack.clientSecret, now: new Date() });
  return { ok: true as const, url: slackAuthorizeUrl({ clientId: slack.clientId, redirectUri: `${appOrigin()}/api/slack/callback`, state }) };
}

export async function disconnectSlack(_data: Record<string, never>, context: { orgId: string }) {
  const auth = await guardOwnerOrAdmin(context.orgId, "Only Admins can disconnect Slack from this workspace.");
  if ("error" in auth) return auth;

  const token = await removeSlackConnection(auth.orgId);
  // Best effort: the connection is gone from Lane either way, and the sealed copy with it.
  if (token && !(await revokeSlackToken(token))) console.error("[slack] Slack did not confirm revoking a disconnected workspace's token");
  revalidatePath("/settings/profile");
  return { success: true };
}
