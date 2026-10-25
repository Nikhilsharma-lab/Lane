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

/** Where delivered links point: the app's own origin, without a trailing slash. */
export function appOrigin(env: Env = process.env): string {
  return (env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "")
}
