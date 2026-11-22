import { describe, expect, it } from "vitest"
import { CODE_COULD_NOT_SEND, INVITATION_COULD_NOT_SEND } from "./auth-email"
import { AUTH_ERROR_COPY, authErrorCopy } from "./auth-error-copy"

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
    for (const code of ["EMAIL_NOT_VERIFIED", "MISSING_RESPONSE", "VERIFICATION_FAILED"]) expect(Object.keys(AUTH_ERROR_COPY)).toContain(code)
  })

  it("has Lane's words for every code the auth route's email-code and reset tests produce", () => {
    expect(authErrorCopy("NO_ACCOUNT")).toBe("No Lane account uses this email.")
    expect(authErrorCopy("INVALID_OTP")).toBe("That code isn’t right. Check the most recent email from Lane.")
    expect(authErrorCopy("OTP_EXPIRED")).toBe("That code has expired. Send a new one.")
    expect(authErrorCopy("TOO_MANY_ATTEMPTS")).toBe("That code has expired. Send a new one.")
    expect(authErrorCopy("CODE_NOT_SENT")).toBe(CODE_COULD_NOT_SEND)
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
