/**
 * #361 (spec #358): the auth-email sender, through its one public entry point. Resend is a fake `fetch`
 * and the Inbox email pause is the in-memory one, so no test reaches Resend or Upstash.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CODE_COULD_NOT_SEND, INVITATION_COULD_NOT_SEND, sendAuthEmail, type AuthEmail } from "./auth-email"
import { createInMemoryEmailPause, type EmailPause } from "./email-pause"
import { RESEND_EMAILS_URL } from "./messenger"

const env = { RESEND_API_KEY: "re_test", LANE_AUTH_EMAIL_FROM: "Lane <auth@mail.uselane.app>" }
const now = new Date("2026-11-21T12:00:00.000Z")

type Call = { url: string; init: RequestInit }
function fakeResend(answer: () => Promise<Response> = async () => new Response("{}", { status: 200 })) {
  const calls: Call[] = []
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return answer()
  }) as typeof globalThis.fetch
  return { calls, fetch }
}
const bodyOf = (call: Call) => JSON.parse(String(call.init.body)) as { from: string; to: string[]; subject: string; text: string; html?: string }
const keyOf = (call: Call) => (call.init.headers as Record<string, string>)["Idempotency-Key"]

let errors: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

async function send(email: AuthEmail, { fetch = fakeResend().fetch, pause = createInMemoryEmailPause(), withEnv = env }: { fetch?: typeof globalThis.fetch; pause?: EmailPause; withEnv?: Record<string, string | undefined> } = {}) {
  return sendAuthEmail(email, { env: withEnv, fetch, emailPause: pause, now: () => now })
}

describe("sending each kind", () => {
  it("sends the sign-up code as one plain-text email from the auth address", async () => {
    const resend = fakeResend()
    expect(await send({ kind: "sign_up_code", to: "ravi@example.test", code: "482913", expiresInMinutes: 10 }, { fetch: resend.fetch })).toEqual({ ok: true })
    expect(resend.calls).toHaveLength(1)
    expect(resend.calls[0].url).toBe(RESEND_EMAILS_URL)
    expect(resend.calls[0].init.headers).toMatchObject({ Authorization: "Bearer re_test" })
    const email = bodyOf(resend.calls[0])
    expect(email.from).toBe("Lane <auth@mail.uselane.app>")
    expect(email.to).toEqual(["ravi@example.test"])
    expect(email.html).toBeUndefined()
    expect(email.subject).toBe("Your Lane verification code")
    expect(email.text.split("\n")[0]).toContain("482913")
    expect(email.text).toContain("10 minutes")
    expect(email.text).not.toMatch(/https?:\/\//)
    expect(email.text).toContain("If you didn’t ask for this code, you can ignore this email.")
  })

  it("sends the sign-in code worded for signing in, with no link", async () => {
    const resend = fakeResend()
    expect(await send({ kind: "sign_in_code", to: "mei@example.test", code: "105277", expiresInMinutes: 5 }, { fetch: resend.fetch })).toEqual({ ok: true })
    expect(resend.calls).toHaveLength(1)
    const email = bodyOf(resend.calls[0])
    expect(email.from).toBe("Lane <auth@mail.uselane.app>")
    expect(email.to).toEqual(["mei@example.test"])
    expect(email.subject).toBe("Your Lane sign-in code")
    expect(email.text.split("\n")[0]).toContain("105277")
    expect(email.text).toContain("5 minutes")
    expect(email.text).not.toMatch(/https?:\/\//)
    expect(email.text).toContain("If you didn’t ask for this code, you can ignore this email.")
    expect(email.text).not.toContain("other devices")
  })

  it("sends the reset code, saying a reset signs out the person's other devices (#344)", async () => {
    const resend = fakeResend()
    expect(await send({ kind: "reset_code", to: "ana@example.test", code: "630041", expiresInMinutes: 1 }, { fetch: resend.fetch })).toEqual({ ok: true })
    expect(resend.calls).toHaveLength(1)
    const email = bodyOf(resend.calls[0])
    expect(email.from).toBe("Lane <auth@mail.uselane.app>")
    expect(email.to).toEqual(["ana@example.test"])
    expect(email.subject).toBe("Your Lane password reset code")
    expect(email.text.split("\n")[0]).toContain("630041")
    expect(email.text).toContain("1 minute.")
    expect(email.text).not.toMatch(/https?:\/\//)
    expect(email.text).toContain("If you didn’t ask for this code, you can ignore this email.")
    expect(email.text).toContain("Resetting your password signs you out of Lane on your other devices.")
  })

  it.each([
    ["admin", "as an Admin"],
    ["member", "as a Member"],
    ["guest", "as a Guest"],
    ["viewer", "as a Viewer"],
  ] as const)("sends the invitation with one link, naming the workspace, inviter, role (%s) and expiry", async (role, asRole) => {
    const resend = fakeResend()
    const acceptUrl = "https://app.uselane.app/accept-invite/inv_7f3a"
    expect(
      await send(
        { kind: "invitation", to: "sam@example.test", workspaceName: "Northwind Design", inviterName: "Priya Raman", role, acceptUrl, expiresAt: new Date("2026-11-28T09:30:00.000Z") },
        { fetch: resend.fetch },
      ),
    ).toEqual({ ok: true })
    expect(resend.calls).toHaveLength(1)
    const email = bodyOf(resend.calls[0])
    expect(email.from).toBe("Lane <auth@mail.uselane.app>")
    expect(email.to).toEqual(["sam@example.test"])
    // A fixed subject: nothing the inviter typed reaches the subject line of mail from Lane's domain.
    expect(email.subject).toBe("You’re invited to a Lane workspace")
    expect(email.text.match(/https?:\/\/\S+/g)).toEqual([acceptUrl])
    expect(email.text).toContain("Northwind Design")
    expect(email.text).toContain("Priya Raman")
    expect(email.text).toContain(asRole)
    expect(email.text).toContain("28 November 2026 at 09:30 UTC")
    expect(email.text).not.toMatch(/owner/i)
    // The ignore-it line belongs to the code kinds only.
    expect(email.text).not.toMatch(/ignore this email/i)
  })
})

const invitation: AuthEmail = {
  kind: "invitation",
  to: "sam@example.test",
  workspaceName: "Northwind Design",
  inviterName: "Priya Raman",
  role: "member",
  acceptUrl: "https://app.uselane.app/accept-invite/inv_7f3a",
  expiresAt: new Date("2026-11-28T09:30:00.000Z"),
}
const code: AuthEmail = { kind: "sign_in_code", to: "mei@example.test", code: "105277", expiresInMinutes: 5 }
const timedOut = () => Promise.reject(Object.assign(new Error("The operation timed out."), { name: "TimeoutError" }))

describe("a name in an invitation", () => {
  // A person's name can be set on Better Auth's own route, past Lane's rule.
  it("keeps to its own line of the email, however it was stored", async () => {
    const resend = fakeResend()
    await send({ ...invitation, inviterName: "Priya\r\n\r\nYour account is locked.\u2028Call us", workspaceName: "W".repeat(500) } as AuthEmail, { fetch: resend.fetch })
    const lines = bodyOf(resend.calls[0]).text.split(/[\r\n\u2028]+/)
    expect(lines[0]).toBe(`Priya Your account is locked. Call us invited you to join ${"W".repeat(99)}… on Lane as a Member.`)
    expect(lines[1]).toBe("Accept the invitation:")
    expect(lines).toHaveLength(4)
  })

  it("says someone, or a workspace, when nothing of it can be shown", async () => {
    const resend = fakeResend()
    await send({ ...invitation, inviterName: "\n", workspaceName: "\u200B" } as AuthEmail, { fetch: resend.fetch })
    expect(bodyOf(resend.calls[0]).text.split("\n")[0]).toBe("Someone invited you to join a workspace on Lane as a Member.")
  })
})

describe("the couldn't-send copy", () => {
  it("is #333 Q7's words for a code, and its own line for the Admin who sent an invitation", () => {
    expect(CODE_COULD_NOT_SEND).toBe("We couldn’t send the code right now. Sign in with your password or Google, or try again later.")
    expect(INVITATION_COULD_NOT_SEND).toMatch(/^We couldn’t send the invitation email right now\./)
  })
})

describe("one email per request", () => {
  it("sends the same code with the same idempotency key, and a different code or kind with another", async () => {
    const resend = fakeResend()
    await send(code, { fetch: resend.fetch })
    await send(code, { fetch: resend.fetch })
    await send({ ...code, code: "905512" }, { fetch: resend.fetch })
    await send({ ...code, kind: "sign_up_code" }, { fetch: resend.fetch })
    await send({ ...code, to: "ana@example.test" }, { fetch: resend.fetch })
    const keys = resend.calls.map(keyOf)
    expect(keys[0]).toBeTruthy()
    expect(keys[0].length).toBeLessThanOrEqual(256)
    expect(keys[1]).toBe(keys[0])
    expect(new Set(keys).size).toBe(4)
    for (const key of keys) for (const personal of ["example.test", "105277", "905512"]) expect(key).not.toContain(personal)
  })

  it("gives a resent invitation, with its new expiry, a new key so Resend doesn't drop it as a repeat", async () => {
    const resend = fakeResend()
    await send(invitation, { fetch: resend.fetch })
    await send(invitation, { fetch: resend.fetch })
    await send({ ...invitation, expiresAt: new Date("2026-11-30T10:00:00.000Z") }, { fetch: resend.fetch })
    const keys = resend.calls.map(keyOf)
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])
    for (const key of keys) expect(key).not.toContain("inv_7f3a")
  })
})

describe("couldn't send", () => {
  it.each([
    ["a 4xx", async () => new Response("{}", { status: 429 }), "resend_429", true],
    ["a 5xx", async () => new Response("{}", { status: 503 }), "resend_503", true],
    ["a thrown fetch", () => Promise.reject(new TypeError("fetch failed")), "resend_unreachable", false],
    ["a timeout", timedOut, "resend_timeout", false],
  ] as const)("%s comes back as couldn't send, logged once without anything personal", async (_label, answer, reason, refused) => {
    for (const email of [code, invitation]) {
      errors.mockClear()
      const pause = createInMemoryEmailPause()
      expect(await send(email, { fetch: fakeResend(answer).fetch, pause })).toEqual({ ok: false, reason })
      expect(errors).toHaveBeenCalledTimes(1)
      const line = errors.mock.calls[0].map(String).join(" ")
      expect(line).toContain("auth-email")
      expect(line).toContain(email.kind)
      expect(line).toContain(reason)
      for (const personal of ["example.test", "105277", "https://", "inv_7f3a", "Northwind", "Priya"]) expect(line).not.toContain(personal)
      // Only a refusal (Resend answered) pauses Inbox email; a send Resend never saw doesn't.
      expect(await pause.isPaused(now)).toBe(refused)
    }
  })

  it("still sends auth email while Inbox email is paused", async () => {
    const pause = createInMemoryEmailPause()
    await pause.pause(now)
    const resend = fakeResend()
    expect(await send(code, { fetch: resend.fetch, pause })).toEqual({ ok: true })
    expect(await send(invitation, { fetch: resend.fetch, pause })).toEqual({ ok: true })
    expect(resend.calls).toHaveLength(2)
    expect(errors).not.toHaveBeenCalled()
  })

  it.each([
    ["RESEND_API_KEY unset", { LANE_AUTH_EMAIL_FROM: env.LANE_AUTH_EMAIL_FROM }],
    ["LANE_AUTH_EMAIL_FROM unset", { RESEND_API_KEY: env.RESEND_API_KEY }],
    ["both unset", {}],
    ["a name set to blanks", { RESEND_API_KEY: env.RESEND_API_KEY, LANE_AUTH_EMAIL_FROM: "  " }],
  ])("sends nothing while not configured (%s)", async (_label, withEnv) => {
    const resend = fakeResend()
    const pause = createInMemoryEmailPause()
    expect(await send(code, { fetch: resend.fetch, pause, withEnv })).toEqual({ ok: false, reason: "not_configured" })
    expect(resend.calls).toHaveLength(0)
    expect(errors).toHaveBeenCalledTimes(1)
    expect(String(errors.mock.calls[0][0])).toContain("not_configured")
    expect(await pause.isPaused(now)).toBe(false)
  })
})
