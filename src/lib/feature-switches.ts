/**
 * Spec #195 build plan, "Switches and env vars": the one module that reads the switches for paid and external
 * services. A switch is on only when its value is "1"; every one is off by default. No other code reads these
 * names from `process.env`.
 */
type Env = Record<string, string | undefined>

export type EmailDelivery =
  | { on: true; apiKey: string; from: string }
  | { on: false; reason: "switched_off" | "missing_credentials" }

/**
 * #206 `LANE_EMAIL_DELIVERY` + `RESEND_API_KEY`, `LANE_EMAIL_FROM`. Off (or on without both credentials) means
 * the recording stand-in: nothing is sent and the delivery log records "would send".
 */
export function emailDelivery(env: Env = process.env): EmailDelivery {
  if (env.LANE_EMAIL_DELIVERY !== "1") return { on: false, reason: "switched_off" }
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.LANE_EMAIL_FROM?.trim()
  if (!apiKey || !from) return { on: false, reason: "missing_credentials" }
  return { on: true, apiKey, from }
}

/** #206 `CRON_SECRET`: while unset, the daily Inbox job refuses every call. */
export function cronSecret(env: Env = process.env): string | null {
  return env.CRON_SECRET?.trim() || null
}

export type SlackDelivery =
  | { on: true; clientId: string; clientSecret: string; tokenKey: Buffer }
  | { on: false; reason: "switched_off" | "missing_credentials" }

/** A 32-byte key written as 64 hex characters or as base64; anything else is no key. */
function tokenKeyOf(text: string | undefined): Buffer | null {
  const value = text?.trim()
  if (!value) return null
  const key = /^[0-9a-f]{64}$/i.test(value) ? Buffer.from(value, "hex") : /^[A-Za-z0-9+/_-]+={0,2}$/.test(value) ? Buffer.from(value, "base64") : null
  return key?.length === 32 ? key : null
}

/**
 * #207 `LANE_SLACK_DELIVERY` + `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `LANE_SLACK_TOKEN_KEY`. Off (or on without
 * all three) means no Slack at all: no connect button, no Slack DM choice, no Slack traffic, and anyone who chose
 * Slack DM gets Email. Lane receives no requests from Slack (no events, no buttons), so it needs no signing secret.
 */
export function slackDelivery(env: Env = process.env): SlackDelivery {
  if (env.LANE_SLACK_DELIVERY !== "1") return { on: false, reason: "switched_off" }
  const clientId = env.SLACK_CLIENT_ID?.trim()
  const clientSecret = env.SLACK_CLIENT_SECRET?.trim()
  const tokenKey = tokenKeyOf(env.LANE_SLACK_TOKEN_KEY)
  if (!clientId || !clientSecret || !tokenKey) return { on: false, reason: "missing_credentials" }
  return { on: true, clientId, clientSecret, tokenKey }
}

/** Where delivered links point: the app's own origin, without a trailing slash. */
export function appOrigin(env: Env = process.env): string {
  return (env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "")
}

/**
 * #210 `LANE_CUSTOM_ROLES`. Guest and Viewer are Clerk custom roles; in production they need Clerk's Enhanced B2B
 * plan, which isn't approved yet. Off, Lane's own invite and role controls offer Admin and Member only, and the
 * server refuses the other two. Turn it on for staging and local work once the Clerk instance defines
 * `org:guest` and `org:viewer`.
 */
export function customRoles(env: Env = process.env): boolean {
  return env.LANE_CUSTOM_ROLES === "1"
}
