import type { AuthAnswer } from "@/lib/auth-client"
import { turnstileSiteKey } from "@/lib/turnstile-site-key"

/** The rendered Turnstile widget, as the human check sees it. */
type Widget = { reset(): void }

/**
 * #377: one screen's Turnstile check. The widget (`TurnstileWidget`) hands it the token when the check passes, and
 * none while it's unfinished or expired. A screen takes the token for a call that needs it, then resets the check
 * after the answer, success or failure, because a token works once.
 */
export type HumanCheck = {
  /** Null when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` isn't set: the check can't run, so the actions needing it are off. */
  readonly siteKey: string | null
  token(): string | null
  reset(): void
  /** The widget's side: it passes a token on, or null when one expires. */
  receive(token: string | null): void
  /** The widget's side: it registers itself once rendered, and the returned function forgets it. */
  connect(widget: Widget): () => void
}

export function createHumanCheck(siteKey: string | null = turnstileSiteKey()): HumanCheck {
  let token: string | null = null
  let widget: Widget | null = null
  return {
    siteKey,
    token: () => token,
    reset() {
      token = null
      widget?.reset()
    },
    receive(next) {
      token = next
    },
    connect(next) {
      widget = next
      return () => {
        if (widget === next) widget = null
      }
    },
  }
}

/**
 * Makes a call that needs the check. With no site key it answers `HUMAN_CHECK_NOT_SET_UP`, and with no token yet
 * `MISSING_RESPONSE`, sending nothing either way. Otherwise it sends the token and resets the check after the
 * answer, whatever it was.
 */
export async function withHumanCheck<T>(check: HumanCheck, call: (token: string) => Promise<AuthAnswer<T>>): Promise<AuthAnswer<T>> {
  if (!check.siteKey) return { ok: false, code: "HUMAN_CHECK_NOT_SET_UP" }
  const token = check.token()
  if (!token) return { ok: false, code: "MISSING_RESPONSE" }
  try {
    return await call(token)
  } finally {
    check.reset()
  }
}
