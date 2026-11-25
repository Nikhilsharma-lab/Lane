/**
 * #371 (spec #369): what the auth route tests share. A browser that keeps its cookies and sends Requests to
 * `/api/auth/[...all]`'s GET and POST as a real one would, and a fake for every outbound call Better Auth and the
 * auth email make: Turnstile's siteverify, Have I Been Pwned's range API, Google's token and userinfo endpoints, and
 * Resend. Anything else that leaves the process fails the test. The browser can also call a Server Action as its
 * person (`action`, #389), and Better Auth itself through Lane's server door (`door`), for what the route doesn't take. And each test file's people, workspaces and clean-up (`authRouteTestFile`).
 */
import { createHash, randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, afterEach, vi } from "vitest"
import type { DoorAnswer } from "@/lib/auth-answer"
import { SOMETHING_WENT_WRONG, authErrorCode, authErrorCopy } from "@/lib/auth-error-copy"
import { askAuthServer } from "@/lib/auth-server"
import { RESEND_EMAILS_URL } from "@/lib/messenger"
import { asServerAction } from "./server-action-request"
import { requireTestDatabase } from "./test-database"

export const AUTH_ORIGIN = "http://localhost:3000"

/** Test values only: no real secret, client or key. The route reads them per request, so stub them before calling it. */
export const TEST_AUTH_ENV = {
  BETTER_AUTH_SECRET: "lane-auth-route-tests-only-not-a-real-secret-0123456789",
  BETTER_AUTH_URL: AUTH_ORIGIN,
  GOOGLE_CLIENT_ID: "lane-auth-route-tests.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "lane-auth-route-tests-google-secret",
  TURNSTILE_SECRET_KEY: "lane-auth-route-tests-turnstile-secret",
  RESEND_API_KEY: "re_lane_auth_route_tests",
  LANE_AUTH_EMAIL_FROM: "Lane <auth@mail.lane.test>",
} as const

/** Switches the route on, with every outbound service configured. Undo with `vi.unstubAllEnvs()`. */
export function switchOnAuthRoute(overrides: Partial<Record<keyof typeof TEST_AUTH_ENV, string>> = {}) {
  for (const [name, value] of Object.entries({ ...TEST_AUTH_ENV, ...overrides })) vi.stubEnv(name, value)
}

export const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
export const HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/"
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_USERINFO_URLS = ["https://openidconnect.googleapis.com/v1/userinfo", "https://www.googleapis.com/oauth2/v3/userinfo"]
/** What the browser puts in `x-captcha-response` after Turnstile's widget passes. */
export const TURNSTILE_TOKEN = "XXXX.DUMMY.TOKEN.XXXX"

export type GoogleProfile = { sub: string; email: string; email_verified: boolean; name: string; picture?: string }
export type OutboundCall = { url: string; method: string; body: string }
/** A faked service's answer to one call. It gets the call, so a test can answer each recipient differently. */
type Answer = (call: OutboundCall) => Response | Promise<Response>

const urlOf = (input: RequestInfo | URL) => (typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
const sha1 = (text: string) => createHash("sha1").update(text).digest("hex").toUpperCase()
const unsignedJwt = (payload: object) =>
  [{ alg: "RS256", kid: "lane-test", typ: "JWT" }, payload].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".") + ".c2ln"

/**
 * Replaces the global fetch for the test (undo with `vi.unstubAllGlobals()`). Better Auth and the auth email read
 * the global fetch at call time, so this one fake catches every outbound call. Each service answers success unless
 * a test changes its answer: `breached` lists passwords the range API reports, `google` is the next Google profile,
 * and `resend`, `turnstile` and `hibp` replace a service's answer.
 */
export function fakeOutbound() {
  const calls: OutboundCall[] = []
  const fake = {
    calls,
    breached: new Set<string>(),
    google: undefined as GoogleProfile | undefined,
    turnstile: (() => Response.json({ success: true })) as Answer,
    resend: (() => Response.json({ id: `email_${randomUUID()}` })) as Answer,
    hibp: undefined as Answer | undefined,
    /** The emails Resend was asked to send, oldest first. */
    emails: () => calls.filter((call) => call.url === RESEND_EMAILS_URL).map((call) => JSON.parse(call.body) as { to: string[]; subject: string; text: string }),
    emailsTo: (address: string) => fake.emails().filter((email) => email.to.includes(address)),
    /** The 6-digit code in the latest email to this address. */
    codeFor(address: string): string {
      const code = fake.emailsTo(address).at(-1)?.text.match(/\b(\d{6})\b/)?.[1]
      if (!code) throw new Error("No code was emailed to that address")
      return code
    },
    callsTo: (prefix: string) => calls.filter((call) => call.url.startsWith(prefix)),
  }
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input)
    const call = { url, method: init?.method ?? (input instanceof Request ? input.method : "GET"), body: typeof init?.body === "string" ? init.body : "" }
    calls.push(call)
    if (url === TURNSTILE_SITEVERIFY_URL) return fake.turnstile(call)
    if (url.startsWith(HIBP_RANGE_URL)) {
      if (fake.hibp) return fake.hibp(call)
      const prefix = url.slice(HIBP_RANGE_URL.length)
      const lines = [...fake.breached].map(sha1).filter((hash) => hash.startsWith(prefix)).map((hash) => `${hash.slice(5)}:42`)
      return new Response([...lines, "0000000000000000000000000000000000A:0"].join("\r\n"), { headers: { "content-type": "text/plain" } })
    }
    if (url.startsWith(GOOGLE_TOKEN_URL) || GOOGLE_USERINFO_URLS.some((info) => url.startsWith(info))) {
      const profile = fake.google
      if (!profile) return Response.json({ error: "invalid_grant" }, { status: 400 })
      if (!url.startsWith(GOOGLE_TOKEN_URL)) return Response.json(profile)
      const now = Math.floor(Date.now() / 1000)
      const idToken = unsignedJwt({ iss: "https://accounts.google.com", aud: TEST_AUTH_ENV.GOOGLE_CLIENT_ID, iat: now, exp: now + 3600, ...profile })
      return Response.json({ access_token: "ya29.lane-test", expires_in: 3599, token_type: "Bearer", scope: "openid email profile", id_token: idToken })
    }
    if (url === RESEND_EMAILS_URL) return fake.resend(call)
    throw new Error(`The test made an unexpected outbound call to ${url}`)
  })
  return fake
}

export type Outbound = ReturnType<typeof fakeOutbound>

// 198.18.0.0/15 is set aside for testing; a random start keeps runs apart in the shared rate_limit table.
let nextAddress = Math.floor(Math.random() * 60_000)
/** A fresh address in the test range, so a browser can step past Better Auth's per-IP limits. */
export const freshIp = () => {
  nextAddress = (nextAddress + 1) % 131_072
  return `198.${18 + (nextAddress >> 16)}.${(nextAddress >> 8) & 255}.${nextAddress & 255}`
}

export type AuthAnswer = { status: number; body: unknown; location: string | null; headers: Headers }

/**
 * One browser: its own IP (sent as Vercel's `x-vercel-forwarded-for`) and cookie jar. It sends Turnstile's token
 * on every call unless `turnstile` is false, as a screen with the widget would.
 */
export class AuthBrowser {
  readonly cookies = new Map<string, string>()
  constructor(
    public ip: string = freshIp(),
    public turnstile = true,
  ) {}

  /** Keeps the cookies a response or an action set, as a browser does. */
  private keep(setCookies: string[]) {
    for (const cookie of setCookies) {
      const [pair, ...attributes] = cookie.split(";")
      const at = pair.indexOf("=")
      const [name, value] = [pair.slice(0, at).trim(), pair.slice(at + 1).trim()]
      if (!value || attributes.some((attribute) => /max-age=0\b/i.test(attribute.trim()))) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  async call(method: "GET" | "POST", path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<AuthAnswer> {
    const headers = new Headers({ origin: AUTH_ORIGIN, "x-vercel-forwarded-for": this.ip, ...extraHeaders })
    if (this.turnstile) headers.set("x-captcha-response", TURNSTILE_TOKEN)
    if (this.cookies.size) headers.set("cookie", this.cookieHeader())
    if (body !== undefined) headers.set("content-type", "application/json")
    const { GET, POST } = await import("@/app/api/auth/[...all]/route")
    const request = new Request(`${AUTH_ORIGIN}/api/auth${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" })
    const response = await (method === "GET" ? GET : POST)(request)
    this.keep(response.headers.getSetCookie())
    const text = await response.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {}
    return { status: response.status, body: parsed, location: response.headers.get("location"), headers: response.headers }
  }

  /**
   * Runs `run` as a Server Action this browser's person calls (#389). The request carries the browser's cookies, IP
   * and origin; `cookies()` and `headers()` read it, in Lane's code and Better Auth's, and a cookie the action writes
   * lands in the jar. Returns what the action returns and throws what it throws. `extraHeaders` adds to the request's
   * headers. A file that uses it must not mock `next/headers`.
   */
  async action<T>(run: () => Promise<T>, extraHeaders: Record<string, string> = {}): Promise<T> {
    const headers = new Headers({ origin: AUTH_ORIGIN, "next-action": "lane-test-action", "x-vercel-forwarded-for": this.ip, ...extraHeaders })
    if (this.cookies.size) headers.set("cookie", this.cookieHeader())
    const { result, setCookies } = await asServerAction(`${AUTH_ORIGIN}/`, headers, run)
    this.keep(setCookies)
    return result()
  }

  /** Asks Better Auth through Lane's server door as this browser's person, as a Server Action's door call does. */
  door = <T>(call: Parameters<typeof askAuthServer<T>>[0]): Promise<DoorAnswer<T>> => this.action(() => askAuthServer(call))

  /** The Cookie header this browser sends. */
  cookieHeader = () => [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ")

  post = (path: string, body: unknown = {}, headers?: Record<string, string>) => this.call("POST", path, body, headers)
  get = (path: string, headers?: Record<string, string>) => this.call("GET", path, undefined, headers)
}

/** The `code` of a Better Auth or Lane error answer, if it has one. */
export const codeOf = (answer: AuthAnswer) => authErrorCode(answer.body)

/**
 * Better Auth's workspace calls, through the door: the route takes none of them from a browser (auth-routes.test.ts).
 * Without an `organizationId`, the browser's active workspace. A role is any value, so a test can ask for one Lane
 * doesn't have.
 */
export const doorInvite = (browser: AuthBrowser, body: { email: string; role: unknown; organizationId?: string; resend?: boolean }) =>
  browser.door((api, asCaller) => api.createInvitation({ ...asCaller, body: body as { email: string; role: "member" } }))
export const doorChangeRole = (browser: AuthBrowser, body: { memberId: string; role: unknown; organizationId?: string }) =>
  browser.door((api, asCaller) => api.updateMemberRole({ ...asCaller, body: body as { memberId: string; role: "member" } }))
export const doorRemove = (browser: AuthBrowser, body: { memberIdOrEmail: string; organizationId?: string }) => browser.door((api, asCaller) => api.removeMember({ ...asCaller, body }))
export const doorLeave = (browser: AuthBrowser, organizationId: string) => browser.door((api, asCaller) => api.leaveOrganization({ ...asCaller, body: { organizationId } }))
export const doorCancel = (browser: AuthBrowser, invitationId: string) => browser.door((api, asCaller) => api.cancelInvitation({ ...asCaller, body: { invitationId } }))
export const doorOpen = (browser: AuthBrowser, organizationId: string) => browser.door((api, asCaller) => api.setActiveOrganization({ ...asCaller, body: { organizationId } }))
export const doorUpdate = (browser: AuthBrowser, organizationId: string, data: { name?: string; slug?: string; logo?: string; metadata?: Record<string, unknown> }) =>
  browser.door((api, asCaller) => api.updateOrganization({ ...asCaller, body: { organizationId, data } }))

/** What a door call answered, or a failure of the test when it was refused. */
export function doorData<T>(answer: DoorAnswer<T>): T {
  if (!answer.ok) throw new Error(`The door answered ${answer.code ?? "no code"}`)
  return answer.data
}

/** The `error` on the redirect back from Google sign-in, if it has one. */
export const googleErrorOf = (answer: AuthAnswer) => (answer.location ? new URL(answer.location, AUTH_ORIGIN).searchParams.get("error") : null)

/**
 * Keeps every error code a test file's answers carried, so its last test can check each one has Lane's own words
 * (#369: no error a person can meet falls to the generic line). Use its `codeOf` and `googleErrorOf` in place of the
 * plain ones.
 */
export function codesMet() {
  const met = new Set<string>()
  const keep = <T extends string | null | undefined>(code: T): T => {
    if (code) met.add(code)
    return code
  }
  return {
    met,
    codeOf: (answer: AuthAnswer) => keep(codeOf(answer)),
    /** The code a door call was refused with, if it was. */
    doorCodeOf: (answer: DoorAnswer<unknown>) => keep(answer.ok ? undefined : answer.code),
    googleErrorOf: (answer: AuthAnswer) => keep(googleErrorOf(answer)),
    /** The codes met that have no words of Lane's, or only the generic line. */
    withoutLaneWords: () => [...met].filter((code) => authErrorCopy(code) === SOMETHING_WENT_WRONG),
  }
}

/** Signs up by password from a fresh browser, as the sign-up screen does. */
export const signUp = (person: { email: string; password: string; name: string }, browser = new AuthBrowser()) => browser.post("/sign-up/email", person)

/** Signs up, enters the emailed verification code, and signs out of the session that makes. Returns a browser with no session, ready to sign in. */
export async function signUpVerified(outbound: Outbound, person: { email: string; password: string; name: string }): Promise<AuthBrowser> {
  const browser = new AuthBrowser()
  const signedUp = await signUp(person, browser)
  if (signedUp.status !== 200) throw new Error(`Sign-up answered ${signedUp.status}`)
  const verified = await browser.post("/email-otp/verify-email", { email: person.email, otp: outbound.codeFor(person.email) })
  if (verified.status !== 200) throw new Error(`Verification answered ${verified.status}`)
  const signedOut = await browser.post("/sign-out")
  if (signedOut.status !== 200 || browser.cookies.size) throw new Error(`Signing out answered ${signedOut.status}`)
  return browser
}

/** Signs in by password, keeping the session cookie in the browser. */
export const signIn = (browser: AuthBrowser, person: { email: string; password: string }) => browser.post("/sign-in/email", { email: person.email, password: person.password })

/**
 * Runs Google sign-in end to end: the browser asks to start, Google (faked) hands back `profile`, and the browser
 * follows the redirect back to Better Auth's callback. Returns the callback's answer: a 302 to `/` on success, or
 * to `/api/auth/error?error=<code>`.
 */
export async function signInWithGoogle(browser: AuthBrowser, outbound: Outbound, profile: GoogleProfile): Promise<AuthAnswer> {
  outbound.google = profile
  const start = await browser.post("/sign-in/social", { provider: "google", callbackURL: "/" })
  const state = new URL((start.body as { url: string }).url).searchParams.get("state")
  return browser.get(`/callback/google?code=lane-test-code&state=${state}`)
}

export type TestPerson = { email: string; password: string; name: string }

/**
 * One auth route test file's database connection, people and workspaces, and the clean-up every such file needs.
 * Everyone it makes has an address at `domain` and every workspace a slug made from it, so its afterAll removes
 * exactly what the file made, and files running side by side never remove each other's. Its afterEach undoes the
 * stubbed env, the fake fetch and every spy. Call it once, at the top of the file. `name` gives a person's name from
 * their label.
 */
export function authRouteTestFile(domain: string, name: (label: string) => string = (label) => `Wren ${label}`) {
  requireTestDatabase(process.env.DATABASE_URL)
  const connection = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} })
  const slugPrefix = `${domain.replace(/[^a-z0-9]+/g, "-")}-`

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
  afterAll(async () => {
    await connection`delete from organizations where slug like ${slugPrefix + "%"}`
    await connection`delete from profiles where email like ${"%@" + domain}`
    await connection`delete from verification where identifier like ${"%@" + domain}`
    await connection.end()
  })

  const person = (label: string): TestPerson => ({ email: `${label}-${randomUUID().slice(0, 8)}@${domain}`, password: "lane-auth-route-test-password", name: name(label) })

  /** A verified person, signed in, in their own browser. */
  async function signedIn(outbound: Outbound, label: string) {
    const someone = person(label)
    const browser = await signUpVerified(outbound, someone)
    const answer = await signIn(browser, someone)
    if (answer.status !== 200) throw new Error(`Sign-in answered ${answer.status}`)
    return { person: someone, browser, userId: (answer.body as { user: { id: string } }).user.id }
  }

  /** Creates a workspace from the browser, as onboarding will. It becomes the browser's active workspace. */
  async function createWorkspace(browser: AuthBrowser, extra: { logo?: string; metadata?: Record<string, unknown> } = {}) {
    const body = { name: "Wren's studio", slug: `${slugPrefix}${randomUUID().slice(0, 8)}`, ...extra }
    return doorData(await browser.door((api, asCaller) => api.createOrganization({ ...asCaller, body }))).id
  }

  /** A new person, invited by the Admin as `role` and accepted. The workspace becomes their active one. */
  async function join(outbound: Outbound, admin: AuthBrowser, role: string, label: string = role) {
    const joiner = await signedIn(outbound, label)
    const invited = doorData(await doorInvite(admin, { email: joiner.person.email, role }))
    const accepted = await joiner.browser.post("/organization/accept-invitation", { invitationId: invited.id })
    if (accepted.status !== 200) throw new Error(`Accepting answered ${accepted.status}: ${JSON.stringify(accepted.body)}`)
    return { ...joiner, memberId: (accepted.body as { member: { id: string } }).member.id }
  }

  return { connection, domain, person, signedIn, createWorkspace, join }
}
