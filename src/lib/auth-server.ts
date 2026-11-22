/**
 * #371 (spec #369): Lane's one Better Auth server, dormant. Only `/api/auth/[...all]` uses it, and only once
 * BETTER_AUTH_SECRET is set, which isn't on staging or production until increment 6. Lint keeps every other file
 * from importing this module or Better Auth's server entry points.
 *
 * The instance is built the first time it's asked for, so importing this module opens no connection and needs no
 * secret. Its settings are the ones #333 and #344 settled; the comments name where each came from.
 */
import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import { createHash, randomUUID } from "node:crypto"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"
import { captcha, emailOTP, haveIBeenPwned, organization } from "better-auth/plugins"
import { createAccessControl } from "better-auth/plugins/access"
import { and, gt, inArray, sql } from "drizzle-orm"
import { account, db, invitation, member, organizations, profiles, rateLimit, session, verification } from "@/db"
import { sendAuthEmail, type AuthEmail } from "./auth-email"
import { AUTH_ERROR_COPY } from "./auth-error-copy"
import { isWorkspacePermission } from "./role-rules"
import type { BetterAuthServer } from "./feature-switches"

type Config = Extract<BetterAuthServer, { on: true }>

const DAY = 24 * 60 * 60
/** How long an emailed code lasts: Better Auth's default, written down so the email can say it. */
const CODE_LIFETIME_SECONDS = 5 * 60

/** Better Auth's code types, as the auth email's kinds. Email change is off, so it never asks for that one. */
const CODE_KINDS = { "email-verification": "sign_up_code", "sign-in": "sign_in_code", "forget-password": "reset_code" } as const
const isCodeType = (type: unknown): type is keyof typeof CODE_KINDS => typeof type === "string" && Object.hasOwn(CODE_KINDS, type)

/**
 * Why an auth request's email didn't go, as the Lane code its answer carries (#369). The answer's message is Lane's
 * own copy; the screens show the copy for the code, never the message.
 */
type NotSent = "CODE_NOT_SENT" | "INVITATION_NOT_SENT" | "TOO_MANY_CODES"
const NOT_SENT_STATUS = { CODE_NOT_SENT: "BAD_GATEWAY", INVITATION_NOT_SENT: "BAD_GATEWAY", TOO_MANY_CODES: "TOO_MANY_REQUESTS" } as const

/**
 * What one auth request's emails did. Better Auth swallows anything a sender throws and answers success, so a sender
 * records here why its email didn't go, and `afterEndpoint` turns that into the request's answer. The route runs
 * every request in its own store, so concurrent requests never see each other's sends. `codeCounted` says the
 * request's code send was already counted against the address's limit before Better Auth made the code.
 */
type RequestEmails = { codeCounted: boolean; notSent?: NotSent }
const requestEmails = new AsyncLocalStorage<RequestEmails>()

/** The first email that didn't go decides the answer. Outside a route request (an `auth.api` call) nothing is kept. */
function noteNotSent(reason: NotSent) {
  const store = requestEmails.getStore()
  if (store && !store.notSent) store.notSent = reason
}

/**
 * Sends one auth email through #358's sender and waits for it. A couldn't-send makes the request answer
 * CODE_NOT_SENT, or INVITATION_NOT_SENT for an invitation; sendAuthEmail has already logged it by kind and reason
 * only. Never throws. Every code, and every invitation, goes through here.
 */
async function sendForRequest(email: AuthEmail): Promise<void> {
  const result = await sendAuthEmail(email)
  if (!result.ok) noteNotSent(email.kind === "invitation" ? "INVITATION_NOT_SENT" : "CODE_NOT_SENT")
}

/** #344: at most 3 codes to one address in any 10 minutes, whatever the IP and whichever code. */
const CODE_LIMIT = 3
const CODE_WINDOW_SECONDS = 10 * 60
const CODE_COUNTER_PREFIX = "lane-codes:"

/**
 * Counts one code send to `email`, or answers false when 3 were already sent in the last 10 minutes. The counter
 * lives in Better Auth's rate_limit table, keyed by a SHA-256 of the lower-cased address and never the address:
 * one row per send (`lane-codes:<hash>:<slot>`, 3 slots), each holding when it was sent. A slot older than 10
 * minutes is free again, so the limit holds over any 10 minutes, not fixed blocks of them. A lock on the address
 * keeps two requests from taking the last slot together.
 */
async function countCodeSend(email: string): Promise<boolean> {
  const hash = createHash("sha256").update(email.trim().toLowerCase()).digest("hex")
  const keys = Array.from({ length: CODE_LIMIT }, (_, slot) => `${CODE_COUNTER_PREFIX}${hash}:${slot}`)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${CODE_COUNTER_PREFIX + hash}))`)
    const now = Date.now()
    const taken = await tx
      .select({ key: rateLimit.key })
      .from(rateLimit)
      .where(and(inArray(rateLimit.key, keys), gt(rateLimit.lastRequest, now - CODE_WINDOW_SECONDS * 1000)))
    const free = keys.find((key) => !taken.some((row) => row.key === key))
    if (!free) return false
    await tx.insert(rateLimit).values({ id: randomUUID(), key: free, count: 1, lastRequest: now }).onConflictDoUpdate({ target: rateLimit.key, set: { count: 1, lastRequest: now } })
    return true
  })
}

/**
 * Workspace management only (#369). Request permissions stay in role-rules.ts, the one source for them. The Admin
 * role is also Better Auth's creator role, so every Admin counts as an owner to Better Auth and the last one can't
 * leave; nothing in Lane is called an owner.
 */
const ac = createAccessControl({ organization: ["update", "delete"], member: ["create", "update", "delete"], invitation: ["create", "cancel"] })
const roles = {
  admin: ac.newRole({ organization: ["update"], member: ["create", "update", "delete"], invitation: ["create", "cancel"] }),
  member: ac.newRole({}),
  guest: ac.newRole({}),
  viewer: ac.newRole({}),
}

/**
 * Better Auth endpoints Lane doesn't use. Each would send a code or set a password without Lane's checks, or
 * belongs to a flow that is off (link-based verification and reset, email change, account deletion).
 */
const DISABLED_PATHS = [
  "/send-verification-email",
  "/verify-email",
  "/request-password-reset",
  "/reset-password",
  "/forget-password/email-otp",
  "/change-email",
  "/delete-user",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
]

/** Turnstile guards account creation and everything that spends one of Lane's daily emails (#344 Q1). */
const TURNSTILE_PATHS = ["/sign-up/email", "/email-otp/send-verification-otp", "/email-otp/request-password-reset", "/email-otp/reset-password"]

/** The endpoints a browser asks for a code on. Sign-up's verification code is sent from inside `/sign-up/email`. */
const CODE_REQUEST_PATHS = ["/email-otp/send-verification-otp", "/email-otp/request-password-reset"]

/** The endpoints that give someone a workspace role. */
const ROLE_PATHS = ["/organization/invite-member", "/organization/update-member-role"]

/**
 * #369's role allow-list: a role must be exactly one of Lane's (WORKSPACE_ROLES), as a string or a one-item list.
 * Anything else, `owner`, a comma list, several roles, an empty or unknown name, gets ROLE_NOT_IN_LANE.
 */
function refuseRoleNotInLane(role: unknown): void {
  const roles = Array.isArray(role) ? role : [role]
  if (roles.length === 1 && typeof roles[0] === "string" && isWorkspacePermission(roles[0])) return
  throw APIError.from("BAD_REQUEST", { code: "ROLE_NOT_IN_LANE", message: AUTH_ERROR_COPY.ROLE_NOT_IN_LANE })
}

/**
 * Lane's checks before Better Auth's own endpoint runs, after Turnstile and Better Auth's IP limit. Better Auth
 * alone answers success and sends nothing in both cases, leaving the person waiting for a code.
 * - Sign-up: an address that already has a Lane account is told so (#369 story 7).
 * - A code request: an address with no Lane account gets NO_ACCOUNT and nothing is sent (#333 Q16). Then the
 *   address's code limit: a fourth code in 10 minutes gets TOO_MANY_CODES. Both run before Better Auth makes the
 *   code, so a refused request leaves the last code sent still working, and only a request that reaches the limit
 *   is counted.
 * - An invitation or a role change: the role allow-list. It runs here, before Better Auth's own checks, because
 *   Better Auth refuses an empty or unknown role itself, with its own code, before its organization hooks run.
 *   So it also runs before the permission check: anyone sending a role Lane doesn't have gets ROLE_NOT_IN_LANE.
 */
const beforeEndpoint = createAuthMiddleware(async (ctx) => {
  if (ROLE_PATHS.includes(ctx.path)) return refuseRoleNotInLane(ctx.body?.role)
  if (ctx.path !== "/sign-up/email" && !CODE_REQUEST_PATHS.includes(ctx.path)) return
  // Better Auth refuses any other code type itself; email change is off.
  if (ctx.path === "/email-otp/send-verification-otp" && !isCodeType(ctx.body?.type)) return
  const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : ""
  const hasAccount = Boolean(email && (await ctx.context.internalAdapter.findUserByEmail(email)))
  if (ctx.path === "/sign-up/email") {
    if (hasAccount) throw APIError.from("UNPROCESSABLE_ENTITY", { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: "A Lane account already uses this email." })
    return
  }
  if (!hasAccount) throw APIError.from("BAD_REQUEST", { code: "NO_ACCOUNT", message: AUTH_ERROR_COPY.NO_ACCOUNT })
  if (!(await countCodeSend(email))) throw APIError.from(NOT_SENT_STATUS.TOO_MANY_CODES, { code: "TOO_MANY_CODES", message: AUTH_ERROR_COPY.TOO_MANY_CODES })
  const store = requestEmails.getStore()
  if (store) store.codeCounted = true
})

/** A request whose email didn't go answers Lane's code for why, in place of Better Auth's success. */
const afterEndpoint = createAuthMiddleware(async (ctx) => {
  const notSent = requestEmails.getStore()?.notSent
  if (!notSent || isAPIError(ctx.context.returned)) return
  throw APIError.from(NOT_SENT_STATUS[notSent], { code: notSent, message: AUTH_ERROR_COPY[notSent] })
})

function build(config: Config) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    telemetry: { enabled: false },
    disabledPaths: DISABLED_PATHS,
    hooks: { before: beforeEndpoint, after: afterEndpoint },
    database: drizzleAdapter(db, { provider: "pg", schema: { profiles, organizations, session, account, verification, member, invitation, rateLimit } }),
    user: {
      modelName: "profiles",
      fields: { name: "fullName" },
      // The profile label (GLOSSARY.md). The browser can't set it; it's changed in Settings → Profile.
      additionalFields: { role: { type: "string", input: false, required: false, defaultValue: "designer" } },
    },
    // Lane keeps no picture of anyone (#344 Q3, #345 Q5): every write that carries one, Google's included, blanks it.
    databaseHooks: {
      user: {
        create: { before: async (user) => ({ data: { ...user, image: null } }) },
        update: { before: async (user) => ("image" in user ? { data: { ...user, image: null } } : undefined) },
      },
    },
    emailAndPassword: { enabled: true, minPasswordLength: 8, requireEmailVerification: true, autoSignIn: false, revokeSessionsOnPasswordReset: true },
    socialProviders: config.google ? { google: config.google } : {},
    // #333 Q11: Google links to an existing account only when Google says the email is verified. Google isn't a
    // trusted provider, because Better Auth links a trusted provider's account even when its email is unverified.
    account: { accountLinking: { enabled: true } },
    session: { expiresIn: 7 * DAY, updateAge: DAY, cookieCache: { enabled: false } },
    // Better Auth limits only in production by default; Lane's counters live in Postgres everywhere (#333 Q1, Q6).
    // The one custom rule matches no path. Whenever an IP counter's window passes, Better Auth deletes every
    // rate_limit row older than its longest window (60 s by default), which would wipe Lane's 10-minute code
    // counters. A 10-minute window here keeps them.
    rateLimit: { enabled: true, storage: "database", customRules: { "/lane-code-counter-window": { window: CODE_WINDOW_SECONDS, max: CODE_LIMIT } } },
    advanced: { ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] } },
    plugins: [
      organization({
        ac,
        roles,
        creatorRole: "admin",
        disableOrganizationDeletion: true,
        requireEmailVerificationOnInvitation: true,
        invitationExpiresIn: 7 * DAY,
        // Better Auth's limits, written down: 100 members and 100 pending invitations per workspace.
        membershipLimit: 100,
        invitationLimit: 100,
        // Awaited, never thrown (Better Auth would swallow it): the invitation row is already written, and the
        // request answers INVITATION_NOT_SENT when the email didn't go, so it can be resent or its link shared.
        // A resend passes the invitation's new expiry, which keeps Resend from dropping it as a duplicate.
        sendInvitationEmail: async ({ id, role, email, organization, inviter, invitation }) => {
          // The role allow-list refused anything else before the invitation was written.
          if (!isWorkspacePermission(role)) return noteNotSent("INVITATION_NOT_SENT")
          await sendForRequest({
            kind: "invitation",
            to: email,
            workspaceName: organization.name,
            inviterName: inviter.user.name,
            role,
            // Nothing serves /invite/<id> until increment 5.
            acceptUrl: `${config.baseURL}/invite/${id}`,
            expiresAt: invitation.expiresAt,
          })
        },
        organizationHooks: {
          // Lane keeps no picture or free-form data on a workspace (#344 Q3). On update, an undefined metadata is
          // left out of the write: Better Auth would store a null as the text "null".
          beforeCreateOrganization: async ({ organization }) => ({ data: { ...organization, logo: null, metadata: undefined } }),
          beforeUpdateOrganization: async ({ organization }) => ({ data: { ...organization, logo: null, metadata: undefined } }),
          // The role allow-list again, where #369 puts it. beforeEndpoint already refused every request and
          // `auth.api` call; this holds an endpoint called as a plain function, which skips hooks.before.
          beforeCreateInvitation: async ({ invitation }) => refuseRoleNotInLane(invitation.role),
          beforeUpdateMemberRole: async ({ newRole }) => refuseRoleNotInLane(newRole),
        },
        schema: {
          organization: {
            modelName: "organizations",
            additionalFields: {
              plan: { type: "string", input: false, required: false, defaultValue: "free" },
              lastRequestNumber: { type: "number", input: false, required: false, defaultValue: 0 },
              ownerUserId: { type: "string", input: false, required: false },
            },
          },
        },
      }),
      emailOTP({
        otpLength: 6,
        expiresIn: CODE_LIFETIME_SECONDS,
        allowedAttempts: 3,
        // Only a hash of each code is kept, so the verification table never holds one that would sign someone in.
        storeOTP: "hashed",
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        // Awaited, never thrown (Better Auth would swallow it): the request's answer says when it didn't go. A code
        // request was counted in beforeEndpoint; sign-up's verification code is counted here, once the account exists.
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (!isCodeType(type)) return
          if (!requestEmails.getStore()?.codeCounted && !(await countCodeSend(email))) return noteNotSent("TOO_MANY_CODES")
          await sendForRequest({ kind: CODE_KINDS[type], to: email, code: otp, expiresInMinutes: CODE_LIFETIME_SECONDS / 60 })
        },
      }),
      captcha({ provider: "cloudflare-turnstile", secretKey: config.turnstileSecretKey ?? "", endpoints: TURNSTILE_PATHS }),
      haveIBeenPwned(),
      nextCookies(),
    ],
  })
}

type Auth = ReturnType<typeof build>
let built: { key: string; auth: Auth } | undefined

/** The one instance, built on first use from the switched-on config. A changed config builds a fresh one. */
export function getAuth(config: Config): Auth {
  const key = JSON.stringify(config)
  if (built?.key !== key) built = { key, auth: build(config) }
  return built.auth
}

/**
 * Answers one HTTP request to `/api/auth/*`. Each request runs in its own email store, so a send that fails reaches
 * that request's answer and no other's.
 */
export async function handleAuthRequest(config: Config, request: Request): Promise<Response> {
  return withLaneCode(request, await requestEmails.run({ codeCounted: false }, () => getAuth(config).handler(request)))
}

/** The path under `/api/auth`, as Better Auth matches it. */
const authPath = (request: Request) => new URL(request.url).pathname.replace(/^\/api\/auth/, "").replace(/\/+$/, "")

/**
 * Gives Lane's own code to an answer Better Auth makes before any endpoint or hook runs, so its code is too broad
 * for Lane's words: Turnstile's plugin answers UNKNOWN_ERROR when siteverify can't be reached (fail closed, nothing
 * else ran). Every other answer is passed on untouched, without reading its body.
 */
async function withLaneCode(request: Request, response: Response): Promise<Response> {
  if (response.status !== 500 || !TURNSTILE_PATHS.includes(authPath(request))) return response
  const body = (await response.clone().json().catch(() => null)) as { code?: unknown } | null
  if (body?.code !== "UNKNOWN_ERROR") return response
  return laneAnswer(response, 503, "HUMAN_CHECK_UNAVAILABLE")
}

function laneAnswer(response: Response, status: number, code: keyof typeof AUTH_ERROR_COPY): Response {
  const headers = new Headers(response.headers)
  headers.delete("content-length")
  return Response.json({ code, message: AUTH_ERROR_COPY[code] }, { status, headers })
}
