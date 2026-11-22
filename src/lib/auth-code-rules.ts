/**
 * #377: how long an emailed code lasts. Safe in the browser: the auth server (src/lib/auth-server.ts) sets Better Auth's
 * code lifetime and the email's words from it, and the code step tells a person the same number, so the two can't
 * drift apart.
 */
export const CODE_LIFETIME_SECONDS = 5 * 60
export const CODE_LIFETIME_MINUTES = CODE_LIFETIME_SECONDS / 60
/** The code's digits, as the server's `otpLength`. */
export const CODE_LENGTH = 6
