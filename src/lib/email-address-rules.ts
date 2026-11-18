/**
 * One rule for a typed email address, safe in the browser: Members' invite field and the server's invite rules
 * (#288, D27), and password recovery (#290, D11). An empty field and a bad format get two messages. The format is
 * zod's `z.email()` pattern, written here because importing it from zod adds 4 KB (gzip) to password recovery's
 * first load: zod's core doesn't tree-shake down to one pattern.
 */

export const EMAIL_MISSING = "Enter an email address."
export const EMAIL_INVALID = "Enter a valid email address."
/** The longest address Lane takes. */
const LONGEST = 320
// zod 4's `regexes.email`, unchanged: a dotted domain with a 2+ letter ending, no leading, trailing or double dots.
const EMAIL = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/

/** What's wrong with an address, spaces around it ignored, or null when it's one. */
export function emailAddressProblem(value: string): string | null {
  const email = value.trim()
  if (!email) return EMAIL_MISSING
  return email.length <= LONGEST && EMAIL.test(email) ? null : EMAIL_INVALID
}
