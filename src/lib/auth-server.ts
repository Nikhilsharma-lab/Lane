/**
 * #371 (spec #369): Lane's one Better Auth server. `/api/auth/[...all]` uses it, and Lane's Server Actions through
 * its one door (`askAuthServer`, #389), only once BETTER_AUTH_SECRET is set, which isn't on staging or production
 * until increment 6. Lint keeps every other file from importing this module or Better Auth's server entry points.
 *
 * The instance is built the first time it's asked for, so importing this module opens no connection and needs no
 * secret. Its settings are the ones #333 and #344 settled; the comments name where each came from.
 */
import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import { createHash, randomUUID } from "node:crypto"
import { betterAuth, type BetterAuthPlugin } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"
import { captcha, emailOTP, haveIBeenPwned, organization } from "better-auth/plugins"
import { createAccessControl } from "better-auth/plugins/access"
import { and, eq, gt, inArray, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { account, db, invitation, member, organizations, profiles, rateLimit, session, verification } from "@/db"
import type { DoorAnswer } from "./auth-answer"
import { CODE_LIFETIME_MINUTES, CODE_LIFETIME_SECONDS } from "./auth-code-rules"
import { sendAuthEmail, type AuthEmail } from "./auth-email"
import { AUTH_ERROR_COPY, authErrorCode } from "./auth-error-copy"
import { isWorkspacePermission, managesWorkspace } from "./role-rules"
import { betterAuthServer, type BetterAuthServer } from "./feature-switches"

type Config = Extract<BetterAuthServer, { on: true }>

/** The Better Auth endpoints Lane's own checks and switches name. */
const PATHS = {
  signUp: "/sign-up/email",
  sendCode: "/email-otp/send-verification-otp",
  requestReset: "/email-otp/request-password-reset",
  resetPassword: "/email-otp/reset-password",
  invite: "/organization/invite-member",
  changeRole: "/organization/update-member-role",
  removeMember: "/organization/remove-member",
} as const

/** An address as Lane looks it up and counts it: Better Auth keeps every address lower-cased. */
const normalEmail = (email: string) => email.trim().toLowerCase()

const DAY = 24 * 60 * 60

/** Better Auth's code types, as the auth email's kinds. Email change is off, so it never asks for that one. */
const CODE_KINDS = { "email-verification": "sign_up_code", "sign-in": "sign_in_code", "forget-password": "reset_code" } as const
const isCodeType = (type: unknown): type is keyof typeof CODE_KINDS => typeof type === "string" && Object.hasOwn(CODE_KINDS, type)

/**
 * Why an auth request's email didn't go, as the Lane code its answer carries (#369). The answer's message is Lane's
 * own copy; the screens show the copy for the code, never the message.
 */
type NotSent = "CODE_NOT_SENT" | "SIGN_UP_CODE_NOT_SENT" | "INVITATION_NOT_SENT" | "TOO_MANY_CODES"
const NOT_SENT_STATUS = { CODE_NOT_SENT: "BAD_GATEWAY", SIGN_UP_CODE_NOT_SENT: "BAD_GATEWAY", INVITATION_NOT_SENT: "BAD_GATEWAY", TOO_MANY_CODES: "TOO_MANY_REQUESTS" } as const
/**
 * Why each email's failed send answers what it does. A sign-up code goes to an account that isn't confirmed yet,
 * which can't sign in by password, so its answer doesn't offer that.
 */
const NOT_SENT_FOR = { sign_up_code: "SIGN_UP_CODE_NOT_SENT", sign_in_code: "CODE_NOT_SENT", reset_code: "CODE_NOT_SENT", invitation: "INVITATION_NOT_SENT" } as const satisfies Record<AuthEmail["kind"], NotSent>

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
 * Sends one auth email through #358's sender and waits for it. A couldn't-send makes the request answer the
 * email's NOT_SENT_FOR code; sendAuthEmail has already logged it by kind and reason only. Never throws. Every code,
 * and every invitation, goes through here.
 */
async function sendForRequest(email: AuthEmail): Promise<void> {
  const result = await sendAuthEmail(email)
  if (!result.ok) noteNotSent(NOT_SENT_FOR[email.kind])
}

/** #344: at most 3 codes to one address in any 10 minutes, whatever the IP and whichever code. */
const CODE_LIMIT = 3
const CODE_WINDOW_SECONDS = 10 * 60
const CODE_COUNTER_PREFIX = "lane-codes:"

/**
 * The counter lives in Better Auth's rate_limit table, keyed by a SHA-256 of the lower-cased address and never the
 * address: one row per send (`lane-codes:<hash>:<slot>`, 3 slots), each holding when it was sent. A slot older than
 * 10 minutes is free again, so the limit holds over any 10 minutes, not fixed blocks of them.
 */
function codeCounter(email: string) {
  const hash = createHash("sha256").update(normalEmail(email)).digest("hex")
  return { lock: CODE_COUNTER_PREFIX + hash, keys: Array.from({ length: CODE_LIMIT }, (_, slot) => `${CODE_COUNTER_PREFIX}${hash}:${slot}`) }
}

/** The first of the address's slots not used in the last 10 minutes, if any. */
async function freeCodeSlot(reader: Pick<typeof db, "select">, keys: string[], now: number): Promise<string | undefined> {
  const taken = await reader
    .select({ key: rateLimit.key })
    .from(rateLimit)
    .where(and(inArray(rateLimit.key, keys), gt(rateLimit.lastRequest, now - CODE_WINDOW_SECONDS * 1000)))
  return keys.find((key) => !taken.some((row) => row.key === key))
}

/** Whether `email` may be sent a code now, without counting one. */
async function mayGetCode(email: string): Promise<boolean> {
  return Boolean(await freeCodeSlot(db, codeCounter(email).keys, Date.now()))
}

/**
 * Counts one code send to `email`, or answers false when 3 were already sent in the last 10 minutes. A lock on the
 * address keeps two requests from taking the last slot together.
 */
async function countCodeSend(email: string): Promise<boolean> {
  const { lock, keys } = codeCounter(email)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lock}))`)
    const now = Date.now()
    const free = await freeCodeSlot(tx, keys, now)
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
const TURNSTILE_PATHS: readonly string[] = [PATHS.signUp, PATHS.sendCode, PATHS.requestReset, PATHS.resetPassword]

/** The endpoints a browser asks for a code on. Sign-up's verification code is sent from inside `/sign-up/email`. */
const CODE_REQUEST_PATHS: readonly string[] = [PATHS.sendCode, PATHS.requestReset]

/** The endpoints that give someone a workspace role. */
const ROLE_PATHS: readonly string[] = [PATHS.invite, PATHS.changeRole]

/**
 * #369's role allow-list: a role must be exactly one of Lane's (WORKSPACE_ROLES), as a string or a one-item list.
 * Anything else, `owner`, a comma list, several roles, an empty or unknown name, gets ROLE_NOT_IN_LANE.
 */
function refuseRoleNotInLane(role: unknown): void {
  const roles = Array.isArray(role) ? role : [role]
  if (roles.length === 1 && typeof roles[0] === "string" && isWorkspacePermission(roles[0])) return
  throw APIError.from("BAD_REQUEST", { code: "ROLE_NOT_IN_LANE", message: AUTH_ERROR_COPY.ROLE_NOT_IN_LANE })
}

const tooManyCodes = () => APIError.from(NOT_SENT_STATUS.TOO_MANY_CODES, { code: "TOO_MANY_CODES", message: AUTH_ERROR_COPY.TOO_MANY_CODES })

/**
 * Lane's checks before Better Auth's own endpoint runs, after Turnstile and Better Auth's IP limit. Better Auth
 * alone answers success and sends nothing in both cases, leaving the person waiting for a code.
 * - Sign-up: an address that already has a Lane account is told so (#369 story 7). Then the address's code limit,
 *   so a sign-up that couldn't be sent its code gets TOO_MANY_CODES before the account is made. It isn't counted
 *   here: Better Auth may still refuse the password, and the code is counted when it's sent.
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
  if (ctx.path !== PATHS.signUp && !CODE_REQUEST_PATHS.includes(ctx.path)) return
  // Better Auth refuses any other code type itself; email change is off.
  if (ctx.path === PATHS.sendCode && !isCodeType(ctx.body?.type)) return
  const email = typeof ctx.body?.email === "string" ? normalEmail(ctx.body.email) : ""
  const hasAccount = Boolean(email && (await ctx.context.internalAdapter.findUserByEmail(email)))
  if (ctx.path === PATHS.signUp) {
    if (hasAccount)
      throw APIError.from("UNPROCESSABLE_ENTITY", { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: AUTH_ERROR_COPY.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL })
    if (email && !(await mayGetCode(email))) throw tooManyCodes()
    return
  }
  if (!hasAccount) throw APIError.from("BAD_REQUEST", { code: "NO_ACCOUNT", message: AUTH_ERROR_COPY.NO_ACCOUNT })
  if (!(await countCodeSend(email))) throw tooManyCodes()
  const store = requestEmails.getStore()
  if (store) store.codeCounted = true
})

/**
 * How long a new password's check may take before Lane gives up on it. Have I Been Pwned's range API is served
 * from Cloudflare's cache and usually answers in well under a second; 3 seconds leaves room for a slow answer while
 * someone waits on sign-up, reset or a password change, and is a third of the 10 seconds Turnstile's check gets.
 */
const PASSWORD_CHECK_TIMEOUT_MS = 3_000

/**
 * Have I Been Pwned's plugin checks a new password inside Better Auth's password hash, on sign-up, reset and
 * password change. When its range API can't be reached it fails closed (the password is refused, nothing is
 * written, an emailed code isn't used up), but with a 500 that has no code, and a range API that never answers
 * holds the request open: its fetch has no timeout and takes no signal. This plugin runs after it, around the
 * same hash. It gives that failure Lane's code, and gives up on a check that takes longer than the timeout with the
 * same code, failing closed the same way. The abandoned fetch is left to settle on its own; its answer is never
 * used. Every other answer of the check, PASSWORD_COMPROMISED included, passes through as it is.
 */
/** The code of an error Better Auth threw or an endpoint returned, read as the copy reads its answers. */
const errorCode = (returned: unknown) => (isAPIError(returned) ? authErrorCode(returned.body) : undefined)

const passwordCheckUnavailable = () => APIError.from("SERVICE_UNAVAILABLE", { code: "PASSWORD_CHECK_UNAVAILABLE", message: AUTH_ERROR_COPY.PASSWORD_CHECK_UNAVAILABLE })
const lanePasswordCheck = {
  id: "lane-password-check",
  init(ctx) {
    const checkedHash = ctx.password.hash
    async function hash(password: string): Promise<string> {
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(passwordCheckUnavailable()), PASSWORD_CHECK_TIMEOUT_MS)
      })
      try {
        return await Promise.race([checkedHash(password), deadline])
      } catch (error) {
        if (isAPIError(error) && error.statusCode === 500 && !errorCode(error)) throw passwordCheckUnavailable()
        throw error
      } finally {
        clearTimeout(timer)
      }
    }
    return { context: { password: { ...ctx.password, hash } } }
  },
} satisfies BetterAuthPlugin

/** Whether this person's member row in the workspace is an Admin's. */
async function isAdminOf(userId: string, workspaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, workspaceId), eq(member.userId, userId)))
  return Boolean(row && isWorkspacePermission(row.role) && managesWorkspace(row.role))
}

/**
 * After Better Auth's endpoint.
 * - Removing someone: Better Auth checks whether the person being removed is an Admin before it checks whether the
 *   remover may remove anyone, so a Member, Guest or Viewer who tries to remove an Admin is told the Admin is the
 *   only one, even when there are others. Only that answer is looked at again: a remover who isn't an Admin of the
 *   workspace gets the not-allowed answer Better Auth gives them for anyone else. An Admin keeps the only-Admin one.
 * - A request whose email didn't go answers Lane's code for why, in place of Better Auth's success.
 */
const afterEndpoint = createAuthMiddleware(async (ctx) => {
  if (ctx.path === PATHS.removeMember && errorCode(ctx.context.returned) === "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER") {
    const signedIn = await getSessionFromCtx(ctx)
    const workspaceId = (typeof ctx.body?.organizationId === "string" && ctx.body.organizationId) || signedIn?.session.activeOrganizationId
    if (!signedIn || !workspaceId || (await isAdminOf(signedIn.user.id, workspaceId))) return
    // Better Auth answers with the status of the error this replaces, 400, whatever this one says.
    throw APIError.from("BAD_REQUEST", { code: "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER", message: AUTH_ERROR_COPY.YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER })
  }
  const notSent = requestEmails.getStore()?.notSent
  if (!notSent || isAPIError(ctx.context.returned)) return
  throw APIError.from(NOT_SENT_STATUS[notSent], { code: notSent, message: AUTH_ERROR_COPY[notSent] })
})

/**
 * Lane keeps no picture or free-form data on a workspace (#344 Q3), on create or update. An undefined metadata is
 * left out of the write: Better Auth would store a null as the text "null".
 */
const withoutPictureOrData = async <Workspace extends object>({ organization }: { organization: Workspace }) => ({
  data: { ...organization, logo: null, metadata: undefined },
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
          beforeCreateOrganization: withoutPictureOrData,
          beforeUpdateOrganization: withoutPictureOrData,
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
        // request was counted in beforeEndpoint. Sign-up's verification code is counted here, once the account exists;
        // beforeEndpoint already refused a sign-up past the limit.
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (!isCodeType(type)) return
          if (!requestEmails.getStore()?.codeCounted && !(await countCodeSend(email))) return noteNotSent("TOO_MANY_CODES")
          await sendForRequest({ kind: CODE_KINDS[type], to: email, code: otp, expiresInMinutes: CODE_LIFETIME_MINUTES })
        },
      }),
      captcha({ provider: "cloudflare-turnstile", secretKey: config.turnstileSecretKey ?? "", endpoints: [...TURNSTILE_PATHS] }),
      haveIBeenPwned(),
      // After haveIBeenPwned, so it wraps the hash that plugin checks in.
      lanePasswordCheck,
      nextCookies(),
    ],
  })
}

type Auth = ReturnType<typeof build>
let built: { key: string; auth: Auth } | undefined

/**
 * The one instance, built on first use from the switched-on config. A changed config builds a fresh one. The config
 * holds the secrets, so the instance is kept under a SHA-256 of it, never the config itself.
 */
function getAuth(config: Config): Auth {
  const key = createHash("sha256").update(JSON.stringify(config)).digest("hex")
  if (built?.key !== key) built = { key, auth: build(config) }
  return built.auth
}

/**
 * Answers one HTTP request to `/api/auth/*`. Each request runs in its own email store, so a send that fails reaches
 * that request's answer and no other's.
 */
export async function handleAuthRequest(config: Config, request: Request): Promise<Response> {
  return withLaneCode(config, request, await requestEmails.run({ codeCounted: false }, () => getAuth(config).handler(request)))
}

/** What every door call passes on from the request: spread it into the call's argument. */
type AsCaller = { headers: Headers }

/**
 * #389 (spec #383): Lane's door to Better Auth for Server Actions. Runs one `auth.api` call as the person whose
 * request this is, in its own email store as the route does, and answers as the browser auth client does: Better
 * Auth's answer, or the code of its refusal. Anything else that goes wrong is thrown, as from any action. Lint lets
 * the Server Actions that need it import it, by name. It checks nothing itself: the action's guard comes first, and
 * the call names its workspace rather than leaving Better Auth its active one.
 *
 *   askAuthServer((api, asCaller) => api.setActiveOrganization({ ...asCaller, body: { organizationId } }))
 *
 * It writes no cookie and renews no session; the app frame's session request does (`auth-client.ts`). No call made
 * here changes the session's token, and a cookie written in a Server Action makes Next draw the page again in the
 * action's answer, which after a switch would be the old page in the new workspace.
 */
export async function askAuthServer<T>(call: (api: Auth["api"], asCaller: AsCaller) => Promise<T>): Promise<DoorAnswer<T>> {
  const config = betterAuthServer()
  if (!config.on) return { ok: false }
  // `_flag` is how Better Auth's router tells nextCookies that the caller handles cookies.
  const asCaller = { headers: new Headers(await headers()), query: { disableRefresh: true }, _flag: "router" } satisfies AsCaller & Record<string, unknown>
  try {
    return { ok: true, data: await requestEmails.run({ codeCounted: false }, () => call(getAuth(config).api, asCaller)) }
  } catch (error) {
    if (!isAPIError(error)) throw error
    return { ok: false, code: errorCode(error) }
  }
}

/** The path under `/api/auth`, as Better Auth matches it. */
const authPath = (request: Request) => new URL(request.url).pathname.replace(/^\/api\/auth/, "").replace(/\/+$/, "")

/**
 * Gives Lane's own code to the answers Better Auth makes before any endpoint or hook runs, which carry no code or
 * one too broad for Lane's words:
 * - its per-IP limit answers 429 with no code (Lane's TOO_MANY_CODES has one, and is kept);
 * - Turnstile's plugin answers 500 UNKNOWN_ERROR, failing closed with nothing else run, both when siteverify can't
 *   be reached or fails and when TURNSTILE_SECRET_KEY isn't set. Only the first is worth trying again in a minute,
 *   so each gets its own code.
 * Every other answer is passed on untouched, without reading its body.
 */
async function withLaneCode(config: Config, request: Request, response: Response): Promise<Response> {
  const turnstileDown = response.status === 500 && TURNSTILE_PATHS.includes(authPath(request))
  if (response.status !== 429 && !turnstileDown) return response
  const code = authErrorCode(await response.clone().json().catch(() => null))
  if (response.status === 429) return code ? response : laneAnswer(response, 429, "RATE_LIMITED")
  if (code !== "UNKNOWN_ERROR") return response
  return laneAnswer(response, 503, config.turnstileSecretKey ? "HUMAN_CHECK_UNAVAILABLE" : "HUMAN_CHECK_NOT_SET_UP")
}

function laneAnswer(response: Response, status: number, code: keyof typeof AUTH_ERROR_COPY): Response {
  const headers = new Headers(response.headers)
  headers.delete("content-length")
  return Response.json({ code, message: AUTH_ERROR_COPY[code] }, { status, headers })
}
