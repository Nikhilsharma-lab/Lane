/**
 * #377 (spec #376, seam 1): the one fake the signed-out screens' tests use. It replaces the global `fetch` (undo
 * with `vi.unstubAllGlobals()`), so Lane's real browser auth client runs, and only the network is faked. Each call
 * to `/api/auth/*` is recorded with its path, JSON body and captcha header, and answered as Better Auth answers:
 * a status and `{ code, message }` on failure, the route's success body otherwise. Codes come from increment 3's
 * route tests. A call anywhere else fails the test.
 */
import { vi } from "vitest"

import { createHumanCheck } from "@/components/auth/better-auth/human-check"

/** Better Auth's own message on every faked failure. No screen may show it. */
export const BETTER_AUTH_MESSAGE = "Better Auth message text, never shown to a person"

/** What the browser puts in `x-captcha-response` once Turnstile's widget passes (as `src/test/auth-route-browser.ts`). */
export const TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"

export type AuthRequest = { path: string; method: string; body: Record<string, unknown>; captcha: string | null }
type Reply = { status: number; body: unknown } | { throws: true }

/** The route's success answers, by path, for any call a test didn't give an answer to. */
const SUCCESS: Record<string, unknown> = {
  "/sign-in/email": { redirect: false, token: "session-token", user: { id: "user_1", email: "mei@example.test" } },
  "/sign-in/email-otp": { token: "session-token", user: { id: "user_1", email: "mei@example.test" } },
  "/sign-in/social": { url: "https://accounts.google.com/o/oauth2/v2/auth?state=fake", redirect: true },
  "/email-otp/send-verification-otp": { success: true },
  "/email-otp/request-password-reset": { success: true },
  "/email-otp/reset-password": { success: true },
  "/email-otp/verify-email": { status: true, token: "session-token", user: { id: "user_1", email: "mei@example.test" } },
  "/sign-up/email": { token: null, user: { id: "user_1", email: "mei@example.test" } },
  "/sign-out": { success: true },
  "/organization/accept-invitation": { invitation: {}, member: {} },
  "/organization/reject-invitation": { invitation: {}, member: null },
}

const PREFIX = "/api/auth"

/** Every error code any fake in this test file answered with, so the file can check each has Lane's words. */
const ANSWERED = new Set<string>()
export const answeredCodes = () => [...ANSWERED]

export function fakeAuthFetch() {
  const requests: AuthRequest[] = []
  const replies = new Map<string, Reply[]>()
  const queue = (path: string, reply: Reply) => replies.set(path, [...(replies.get(path) ?? []), reply])
  const fake = {
    requests,
    /** Every error code this fake answered with. */
    codes: new Set<string>(),
    /** The next call to `path` fails with Better Auth's answer shape. */
    refuse(path: string, status: number, code: string) {
      queue(path, { status, body: { code, message: BETTER_AUTH_MESSAGE } })
      return fake
    },
    /** The next call to `path` answers success with `body`. */
    succeed(path: string, body: unknown) {
      queue(path, { status: 200, body })
      return fake
    },
    /** The next call to `path` never reaches the server: the fetch itself throws, as it does offline. */
    throwOn(path: string) {
      queue(path, { throws: true })
      return fake
    },
    to: (path: string) => requests.filter((request) => request.path === path),
  }
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, "http://lane.test")
    if (!url.pathname.startsWith(PREFIX + "/")) throw new Error(`The test made an unexpected call to ${url.href}`)
    const path = url.pathname.slice(PREFIX.length)
    const body = typeof init?.body === "string" && init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {}
    requests.push({ path, method: init?.method ?? "GET", body, captcha: new Headers(init?.headers).get("x-captcha-response") })
    const reply = replies.get(path)?.shift()
    if (reply && "throws" in reply) throw new TypeError("Failed to fetch")
    if (reply) {
      const code = (reply.body as { code?: unknown } | null)?.code
      if (typeof code === "string") {
        fake.codes.add(code)
        ANSWERED.add(code)
      }
      return Response.json(reply.body, { status: reply.status })
    }
    if (!(path in SUCCESS)) throw new Error(`The test made an unexpected call to ${path}`)
    return Response.json(SUCCESS[path])
  })
  return fake
}

export type AuthFetchFake = ReturnType<typeof fakeAuthFetch>

/** Cloudflare's published test site key that always passes. */
export const TEST_SITE_KEY = "1x00000000000000000000AA"

/**
 * A screen's human check as if Turnstile's widget had rendered and passed: it holds `TURNSTILE_TOKEN`, and counts
 * the widget resets. `pass` stands for the widget passing again after a reset. With a null site key the check isn't
 * set up and holds no token.
 */
export function passedHumanCheck(siteKey: string | null = TEST_SITE_KEY) {
  const check = createHumanCheck(siteKey)
  let resets = 0
  check.connect({ reset: () => void resets++ })
  if (siteKey) check.receive(TURNSTILE_TOKEN)
  return { check, resets: () => resets, pass: (token: string = TURNSTILE_TOKEN) => check.receive(token) }
}
