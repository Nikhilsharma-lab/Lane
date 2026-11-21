/**
 * #371 (spec #369): Lane's one Better Auth server, dormant. Only `/api/auth/[...all]` uses it, and only once
 * BETTER_AUTH_SECRET is set, which isn't on staging or production until increment 6. Lint keeps every other file
 * from importing this module or Better Auth's server entry points.
 *
 * The instance is built the first time it's asked for, so importing this module opens no connection and needs no
 * secret. Its settings are the ones #333 and #344 settled; the comments name where each came from.
 */
import "server-only"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { nextCookies } from "better-auth/next-js"
import { captcha, emailOTP, haveIBeenPwned, organization } from "better-auth/plugins"
import { createAccessControl } from "better-auth/plugins/access"
import { account, db, invitation, member, organizations, profiles, rateLimit, session, verification } from "@/db"
import { sendAuthEmail, type AuthEmail } from "./auth-email"
import type { BetterAuthServer } from "./feature-switches"

type Config = Extract<BetterAuthServer, { on: true }>

const DAY = 24 * 60 * 60
/** How long an emailed code lasts: Better Auth's default, written down so the email can say it. */
const CODE_LIFETIME_SECONDS = 5 * 60

/** Better Auth's code types, as the auth email's kinds. Email change is off, so it never asks for that one. */
const CODE_KINDS = { "email-verification": "sign_up_code", "sign-in": "sign_in_code", "forget-password": "reset_code" } as const

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

/**
 * Lane's checks before Better Auth's own endpoint runs, after Turnstile and Better Auth's IP limit. Sign-up: an
 * address that already has a Lane account is told so (#369 story 7). Better Auth alone would answer success and
 * send nothing, leaving the person waiting for a code.
 */
const beforeEndpoint = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-up/email") return
  const email = typeof ctx.body?.email === "string" ? ctx.body.email.trim().toLowerCase() : ""
  if (email && (await ctx.context.internalAdapter.findUserByEmail(email)))
    throw APIError.from("UNPROCESSABLE_ENTITY", { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: "A Lane account already uses this email." })
})

function build(config: Config) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    telemetry: { enabled: false },
    disabledPaths: DISABLED_PATHS,
    hooks: { before: beforeEndpoint },
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
    rateLimit: { enabled: true, storage: "database" },
    advanced: { ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] } },
    plugins: [
      organization({
        ac,
        roles,
        creatorRole: "admin",
        disableOrganizationDeletion: true,
        requireEmailVerificationOnInvitation: true,
        invitationExpiresIn: 7 * DAY,
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
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        // Awaited, never thrown: a send that fails is logged by sendAuthEmail with its kind and reason only.
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (!(type in CODE_KINDS)) return
          const code: AuthEmail = { kind: CODE_KINDS[type as keyof typeof CODE_KINDS], to: email, code: otp, expiresInMinutes: CODE_LIFETIME_SECONDS / 60 }
          await sendAuthEmail(code)
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
