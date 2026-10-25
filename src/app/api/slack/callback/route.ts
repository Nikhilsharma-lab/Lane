import { revalidatePath } from "next/cache";

import { requireOwnerOrAdmin } from "@/lib/auth-guard";
import { appOrigin, slackDelivery } from "@/lib/feature-switches";
import { saveSlackConnection } from "@/lib/slack-connection";
import { exchangeSlackCode, readInstallState } from "@/lib/slack-install";

/**
 * #207: where Slack's standard install flow returns (approved in spec #195's build plan). The signed state names
 * the workspace and the Admin who started it; only that Admin, still an Admin of that workspace, can finish. The
 * code is traded for the bot token, which is stored sealed. Every outcome lands back on Settings → Slack with a
 * plain result; nothing about the token or the Slack team is put in the URL.
 */
type Result = "connected" | "cancelled" | "expired" | "refused" | "failed" | "unavailable";

const back = (request: Request, result: Result) =>
  Response.redirect(new URL(`/settings/profile?section=slack&slack=${result}`, request.url), 307);

export async function GET(request: Request) {
  const slack = slackDelivery();
  if (!slack.on) return back(request, "unavailable");
  const query = new URL(request.url).searchParams;
  const state = readInstallState(query.get("state") ?? "", { secret: slack.clientSecret, now: new Date() });
  if (!state) return back(request, "expired");
  if (query.get("error")) return back(request, "cancelled");

  const admin = await requireOwnerOrAdmin(state.orgId);
  if (!admin || admin.userId !== state.userId) return back(request, "refused");
  const code = query.get("code");
  if (!code) return back(request, "failed");

  const install = await exchangeSlackCode({ clientId: slack.clientId, clientSecret: slack.clientSecret, code, redirectUri: `${appOrigin()}/api/slack/callback` });
  if (!install.ok) {
    console.error(`[slack] connecting a workspace failed: ${install.reason}`);
    return back(request, "failed");
  }
  await saveSlackConnection({ orgId: admin.orgId, userId: admin.userId }, install, { tokenKey: slack.tokenKey });
  revalidatePath("/settings/profile");
  return back(request, "connected");
}
