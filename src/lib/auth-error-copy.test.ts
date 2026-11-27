import { describe, expect, it } from "vitest"
import { CODE_COULD_NOT_SEND, INVITATION_COULD_NOT_SEND } from "./auth-email"
import { AUTH_ERROR_COPY, authErrorCode, authErrorCopy, googleConnectionCode } from "./auth-error-copy"

/**
 * #371 (spec #369): what a person reads when an auth call fails. Better Auth's own message is never shown. The
 * copy check (src/test/copy-check.test.ts) scans these strings with the rest of Lane's copy.
 */
describe("Auth error copy", () => {
  it("has Lane's words for every code the auth route's sign-up, sign-in and Google tests produce", () => {
    expect(authErrorCopy("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")).toBe("A Lane account already uses this email.")
    expect(authErrorCopy("PASSWORD_TOO_SHORT")).toBe("Use at least 8 characters.")
    expect(authErrorCopy("PASSWORD_COMPROMISED")).toBe("This password has appeared in a data breach elsewhere. Choose a different one.")
    expect(authErrorCopy("INVALID_EMAIL_OR_PASSWORD")).toBe("That email and password don’t match. Try again, or email yourself a code.")
    expect(authErrorCopy("account_not_linked")).toBe("Google sign-in didn’t finish. Try again, or use your email.")
    expect(authErrorCopy("EMAIL_NOT_VERIFIED")).toBe("This email isn’t confirmed yet. Email yourself a code to confirm it.")
    // Proposed for Nikhil to confirm.
    expect(authErrorCopy("MISSING_RESPONSE")).toBe("Finish the check that you’re human, then try again.")
    expect(authErrorCopy("VERIFICATION_FAILED")).toBe("We couldn’t confirm you’re human. Refresh the page and try again.")
  })

  it("gives every error Google sign-in's redirect back can carry #346's Google line", () => {
    const errors = [
      ...["no_code", "oauth_provider_not_found", "issuer_missing", "issuer_mismatch", "invalid_code", "nonce_binding_missing", "unable_to_get_user_info"],
      ...["no_callback_url", "unable_to_link_account", "email_does_not_match", "account_already_linked_to_different_user", "email_not_found", "email_not_verified"],
      ...["invalid_callback_request", "state_not_found", "state_mismatch", "state_invalid", "internal_server_error"],
      ...["account_not_linked", "unable_to_update_account", "signup_disabled", "unable_to_create_user", "unable_to_create_session"],
      ...["access_denied", "invalid_request", "unauthorized_client", "unsupported_response_type", "invalid_scope", "server_error", "temporarily_unavailable"],
    ]
    for (const error of errors) expect([error, authErrorCopy(error)]).toEqual([error, "Google sign-in didn’t finish. Try again, or use your email."])
  })

  it("has Lane's words, proposed for Nikhil to confirm, for a check that couldn't run and for Better Auth's own limit", () => {
    expect(authErrorCopy("HUMAN_CHECK_UNAVAILABLE")).toBe("We couldn’t run the check that you’re human right now. Try again in a minute.")
    expect(authErrorCopy("HUMAN_CHECK_NOT_SET_UP")).toBe("We can’t run the check that you’re human, so this is off for now. Continue with Google instead, or try again later.")
    expect(authErrorCopy("PASSWORD_CHECK_UNAVAILABLE")).toBe("We couldn’t check this password right now. Try again in a minute.")
    // #346's rateLimited line.
    expect(authErrorCopy("RATE_LIMITED")).toBe("Too many tries. Wait a minute, then try again.")
  })

  it("has Lane's words, proposed for Nikhil to confirm, for a password that's too long and a workspace URL that's taken", () => {
    expect(authErrorCopy("PASSWORD_TOO_LONG")).toBe("Use at most 128 characters.")
    for (const code of ["ORGANIZATION_ALREADY_EXISTS", "ORGANIZATION_SLUG_ALREADY_TAKEN"])
      expect(authErrorCopy(code)).toBe("Another workspace already uses this URL. Choose a different one, then try again.")
  })

  it("has Lane's words for every code the auth route's email-code and reset tests produce", () => {
    expect(authErrorCopy("NO_ACCOUNT")).toBe("No Lane account uses this email.")
    expect(authErrorCopy("INVALID_OTP")).toBe("That code isn’t right. Check the most recent email from Lane.")
    expect(authErrorCopy("OTP_EXPIRED")).toBe("That code has expired. Send a new one.")
    expect(authErrorCopy("TOO_MANY_ATTEMPTS")).toBe("That code has expired. Send a new one.")
    expect(authErrorCopy("CODE_NOT_SENT")).toBe(CODE_COULD_NOT_SEND)
    // #346's sendFailedSignup, verbatim.
    expect(authErrorCopy("SIGN_UP_CODE_NOT_SENT")).toBe("We couldn’t send the code right now. Try again in a few minutes.")
    // Proposed for Nikhil to confirm (#372).
    expect(authErrorCopy("TOO_MANY_CODES")).toBe("Too many codes sent to this email. Wait 10 minutes, then try again.")
  })

  it("has Lane's own words, each saying what to do next, for every code the auth route's workspace tests produce", () => {
    const onlyAdmin = "You’re the only Admin. Make someone else an Admin before you leave."
    expect(authErrorCopy("YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER")).toBe(onlyAdmin)
    expect(authErrorCopy("YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER")).toBe(onlyAdmin)
    // Proposed for Nikhil to confirm (#373).
    expect(authErrorCopy("ROLE_NOT_IN_LANE")).toBe("Lane has no such role. Choose Admin, Member, Guest or Viewer.")
    expect(authErrorCopy("INVITATION_NOT_SENT")).toBe(INVITATION_COULD_NOT_SEND)
    expect(authErrorCopy("YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION")).toBe("This invitation was sent to a different email. Sign in with that email to accept it.")
    expect(authErrorCopy("INVITATION_NOT_FOUND")).toBe("This invitation has expired or is no longer open. Ask the person who invited you to send a new one.")
    const own = [
      "UNAUTHORIZED",
      "ORGANIZATION_DELETION_DISABLED",
      "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION",
      "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION",
      "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
      "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
      "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION",
      "INVITATION_LIMIT_REACHED",
      "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
      "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
    ]
    const words = own.map((code) => authErrorCopy(code))
    expect(words).not.toContain("Something went wrong. Try again.")
    expect(new Set(words).size).toBe(own.length)
    // Two sentences: what happened, then what to do.
    for (const sentence of words) expect(sentence.split(". ").length).toBeGreaterThanOrEqual(2)
  })

  // #380: Settings → Profile's account section.
  it("has Lane's words for every code Settings → Profile's account section meets", () => {
    // #346's words.
    expect(authErrorCopy("INVALID_PASSWORD")).toBe("That isn’t your current password.")
    expect(authErrorCopy("FAILED_TO_UNLINK_LAST_ACCOUNT")).toBe("Google is your only sign-in method. Set a password before disconnecting it.")
    // Proposed for Nikhil to confirm: Lane's codes for a Google connection that came back without connecting.
    expect(authErrorCopy("GOOGLE_EMAIL_DOES_NOT_MATCH")).toBe("That Google account uses a different email, so nothing changed. Choose the Google account that uses your Lane email.")
    expect(authErrorCopy("GOOGLE_NOT_CONNECTED")).toBe("Google didn’t connect, so nothing changed. Try again.")
    // Nikhil's words (2026-11-23).
    expect(authErrorCopy("GOOGLE_ALREADY_LINKED")).toBe("That Google account is already connected to another Lane account.")
    // The password answers it shares with sign-up.
    for (const code of ["PASSWORD_TOO_SHORT", "PASSWORD_COMPROMISED", "PASSWORD_CHECK_UNAVAILABLE", "UNAUTHORIZED"]) expect(authErrorCopy(code)).not.toBe("Something went wrong. Try again.")
  })

  // Proposed for Nikhil to confirm: a workspace's or person's name past Lane's rule (name-rules.ts).
  it("has Lane's words for a name that's too long or holds a line break", () => {
    expect(authErrorCopy("NAME_TOO_LONG")).toBe("Use at most 100 characters.")
    expect(authErrorCopy("NAME_NOT_PLAIN")).toBe("Use one line of plain text.")
  })

  it("names what came back from Google's redirect to Settings after Connect Google", () => {
    expect(googleConnectionCode("email_does_not_match")).toBe("GOOGLE_EMAIL_DOES_NOT_MATCH")
    expect(googleConnectionCode("account_already_linked_to_different_user")).toBe("GOOGLE_ALREADY_LINKED")
    for (const error of ["access_denied", "state_mismatch", "unable_to_link_account"]) expect(googleConnectionCode(error)).toBe("GOOGLE_NOT_CONNECTED")
  })

  // #377: the sign-in screens' tests (src/components/auth/better-auth) meet these codes, from increment 3's route
  // tests and the screens' own human check. Each has its own words: none falls back to the generic line.
  it("has Lane's words for every code the sign-in screens' tests produce", () => {
    expect(authErrorCopy("INVALID_EMAIL_OR_PASSWORD")).toBe("That email and password don’t match. Try again, or email yourself a code.")
    expect(authErrorCopy("EMAIL_NOT_VERIFIED")).toBe("This email isn’t confirmed yet. Email yourself a code to confirm it.")
    expect(authErrorCopy("access_denied")).toBe("Google sign-in didn’t finish. Try again, or use your email.")
    expect(authErrorCopy("NO_ACCOUNT")).toBe("No Lane account uses this email.")
    expect(authErrorCopy("CODE_NOT_SENT")).toBe("We couldn’t send the code right now. Sign in with your password or Google, or try again later.")
    expect(authErrorCopy("TOO_MANY_CODES")).toBe("Too many codes sent to this email. Wait 10 minutes, then try again.")
    expect(authErrorCopy("RATE_LIMITED")).toBe("Too many tries. Wait a minute, then try again.")
    expect(authErrorCopy("INVALID_OTP")).toBe("That code isn’t right. Check the most recent email from Lane.")
    expect(authErrorCopy("OTP_EXPIRED")).toBe("That code has expired. Send a new one.")
    expect(authErrorCopy("MISSING_RESPONSE")).toBe("Finish the check that you’re human, then try again.")
    expect(authErrorCopy("HUMAN_CHECK_NOT_SET_UP")).toBe("We can’t run the check that you’re human, so this is off for now. Continue with Google instead, or try again later.")
    expect(authErrorCopy(undefined)).toBe("Something went wrong. Try again.")
  })

  // #379: the invitation page's and Onboarding's tests meet these codes. Each was already in the table.
  it("has Lane's words for every code the invitation and Onboarding screens' tests produce", () => {
    for (const code of [
      "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
      "INVITATION_NOT_FOUND",
      "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
      "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
      "ORGANIZATION_ALREADY_EXISTS",
      "UNAUTHORIZED",
    ]) expect([code, Object.hasOwn(AUTH_ERROR_COPY, code)]).toEqual([code, true])
    expect(authErrorCopy("EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION")).toBe("Confirm your email before you accept. Email yourself a code to confirm it.")
    expect(authErrorCopy("INVITATION_NOT_FOUND")).toBe("This invitation has expired or is no longer open. Ask the person who invited you to send a new one.")
  })

  // #378: the sign-up and forgot-and-reset screens' tests meet these codes besides the sign-in ones above. Every one
  // was already in the table, so #378 adds no entry.
  it("has Lane's words for every code the sign-up and reset screens' tests produce", () => {
    expect(authErrorCopy("PASSWORD_TOO_SHORT")).toBe("Use at least 8 characters.")
    expect(authErrorCopy("PASSWORD_COMPROMISED")).toBe("This password has appeared in a data breach elsewhere. Choose a different one.")
    expect(authErrorCopy("PASSWORD_CHECK_UNAVAILABLE")).toBe("We couldn’t check this password right now. Try again in a minute.")
    expect(authErrorCopy("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")).toBe("A Lane account already uses this email.")
    expect(authErrorCopy("SIGN_UP_CODE_NOT_SENT")).toBe("We couldn’t send the code right now. Try again in a few minutes.")
    expect(authErrorCopy("TOO_MANY_ATTEMPTS")).toBe("That code has expired. Send a new one.")
    expect(authErrorCopy("HUMAN_CHECK_UNAVAILABLE")).toBe("We couldn’t run the check that you’re human right now. Try again in a minute.")
  })

  it("reads the code from a Better Auth or Lane error answer's body, and nothing from any other body", () => {
    expect(authErrorCode({ code: "INVALID_OTP", message: "Invalid OTP" })).toBe("INVALID_OTP")
    for (const body of [{ message: "Too many requests. Please try again later." }, { code: 42 }, { code: "" }, "INVALID_OTP", null, undefined]) expect(authErrorCode(body)).toBeUndefined()
  })

  it("gives the generic line for a code it doesn't know, or no code at all", () => {
    for (const code of ["SOMETHING_NEW_IN_BETTER_AUTH", "constructor", "", null, undefined]) expect(authErrorCopy(code)).toBe("Something went wrong. Try again.")
  })

  it("never says owner, in any case", () => {
    for (const words of Object.values(AUTH_ERROR_COPY)) expect(words).not.toMatch(/owner/i)
  })

  it("uses increment 2's couldn't-send sentences, not copies of them", () => {
    expect(AUTH_ERROR_COPY.CODE_NOT_SENT).toBe(CODE_COULD_NOT_SEND)
    expect(AUTH_ERROR_COPY.INVITATION_NOT_SENT).toBe(INVITATION_COULD_NOT_SEND)
  })
})
