import { regexes } from "zod/v4/core"

/**
 * One rule for a typed email address, safe in the browser: Members' invite field and the server's invite rules
 * (#288, D27), and password recovery (#290, D11). An empty field and a bad format get two messages. The format is
 * zod's `z.email()` rule, taken on its own so password recovery doesn't load zod.
 */

export const EMAIL_MISSING = "Enter an email address."
export const EMAIL_INVALID = "Enter a valid email address."
/** The longest address Lane takes. */
const LONGEST = 320

/** What's wrong with an address, spaces around it ignored, or null when it's one. */
export function emailAddressProblem(value: string): string | null {
  const email = value.trim()
  if (!email) return EMAIL_MISSING
  return email.length <= LONGEST && regexes.email.test(email) ? null : EMAIL_INVALID
}
