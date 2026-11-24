/**
 * #377: what Lane's auth screens and Settings check before any request, shared with the auth server. Safe in the
 * browser. The server (src/lib/auth-server.ts) sets Better Auth's code lifetime and the email's words from
 * `CODE_LIFETIME_SECONDS`, and the code step tells a person the same number, so the two can't drift apart.
 */
export const CODE_LIFETIME_SECONDS = 5 * 60
export const CODE_LIFETIME_MINUTES = CODE_LIFETIME_SECONDS / 60
/** The code's digits, as the server's `otpLength`. */
export const CODE_LENGTH = 6
/** Better Auth's shortest password on Lane's server (increment 3's `minPasswordLength`), said before any request. */
export const PASSWORD_MIN_LENGTH = 8

/** Whether `code`, trimmed, is a whole code: `CODE_LENGTH` digits. */
export const isWholeCode = (code: string) => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim())

// Proposed for Nikhil (#377): the prototype keeps Sign in disabled until six digits; Lane says it on the field instead.
export const CODE_MISSING = "Enter the 6-digit code from the email."
/** The line for an empty new password: reset and Settings say it. */
export const NEW_PASSWORD_MISSING = "Enter a new password."
// Proposed for Nikhil (#378): the prototype's client-side line (auth-prototype.tsx:234), not in #346's ERR table.
// Sign-up and Settings → Profile's name say it.
export const PERSON_NAME_MISSING = "Enter your name."
