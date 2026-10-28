/**
 * #207: Slack's standard install flow (OAuth v2) for connecting a workspace, and revoking on disconnect. The
 * Admin is sent to Slack's install page with a signed `state` naming the workspace and Admin who started it;
 * Slack sends them back to `GET /api/slack/callback` with a code, which is traded here for the bot token. Calls
 * go through the `fetch` given (a fake in tests); failures come back as reasons, never thrown, never carrying a
 * token. Only used while the Slack switch is on (`src/lib/feature-switches.ts`).
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { SLACK_API } from "./messenger"

/** Send DMs, and find each person in Slack by the email address Lane knows them by. Nothing else. */
export const SLACK_SCOPES = ["chat:write", "users:read", "users:read.email"] as const
export const SLACK_AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize"
/** How long an Admin has on Slack's install page before the round trip is refused. */
export const INSTALL_STATE_TTL_MS = 10 * 60 * 1000

export function slackAuthorizeUrl({ clientId, redirectUri, state }: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(SLACK_AUTHORIZE_URL)
  url.search = new URLSearchParams({ client_id: clientId, scope: SLACK_SCOPES.join(","), redirect_uri: redirectUri, state }).toString()
  return url.toString()
}

type InstallState = { orgId: string; userId: string }
const mac = (body: string, secret: string) => createHmac("sha256", `lane-slack-install\n${secret}`).update(body).digest("base64url")

/** `<payload>.<mac>`: the workspace, the Admin and when it expires, signed with the app's client secret. */
export function signInstallState({ orgId, userId }: InstallState, { secret, now }: { secret: string; now: Date }): string {
  const body = Buffer.from(JSON.stringify({ orgId, userId, exp: now.getTime() + INSTALL_STATE_TTL_MS })).toString("base64url")
  return `${body}.${mac(body, secret)}`
}

/** The workspace and Admin a returning `state` was signed for, or null when it is forged, damaged or expired. */
export function readInstallState(state: string, { secret, now }: { secret: string; now: Date }): InstallState | null {
  const [body, signature, ...rest] = state.split(".")
  if (!body || !signature || rest.length) return null
  const expected = Buffer.from(mac(body, secret))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<InstallState & { exp: number }>
    if (typeof parsed.orgId !== "string" || typeof parsed.userId !== "string" || typeof parsed.exp !== "number" || now.getTime() > parsed.exp) return null
    return { orgId: parsed.orgId, userId: parsed.userId }
  } catch {
    return null
  }
}

export type SlackInstall = { ok: true; token: string; teamId: string; teamName: string } | { ok: false; reason: string }

/** Trades the code Slack returned for the workspace's bot token (`oauth.v2.access`). */
export async function exchangeSlackCode({ clientId, clientSecret, code, redirectUri, fetch: send = fetch }: {
  clientId: string; clientSecret: string; code: string; redirectUri: string; fetch?: typeof fetch
}): Promise<SlackInstall> {
  try {
    const response = await send(`${SLACK_API}/oauth.v2.access`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }).toString(),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return { ok: false, reason: `slack_${response.status}` }
    const answer = (await response.json()) as { ok?: boolean; error?: string; token_type?: string; access_token?: string; team?: { id?: string; name?: string } }
    if (!answer.ok) return { ok: false, reason: `slack_${answer.error ?? "refused"}` }
    if (answer.token_type !== "bot" || !answer.access_token?.startsWith("xoxb-") || !answer.team?.id) return { ok: false, reason: "slack_no_bot_token" }
    return { ok: true, token: answer.access_token, teamId: answer.team.id, teamName: answer.team.name?.trim() || answer.team.id }
  } catch {
    return { ok: false, reason: "slack_unreachable" }
  }
}

/** Revokes the bot token when an Admin disconnects (`auth.revoke`). False when Slack couldn't be told. */
export async function revokeSlackToken(token: string, { fetch: send = fetch }: { fetch?: typeof fetch } = {}): Promise<boolean> {
  try {
    const response = await send(`${SLACK_API}/auth.revoke`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "",
      signal: AbortSignal.timeout(10_000),
    })
    const answer = (await response.json()) as { ok?: boolean }
    return response.ok && !!answer.ok
  } catch {
    return false
  }
}
