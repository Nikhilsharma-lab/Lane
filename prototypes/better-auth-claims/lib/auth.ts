// PROTOTYPE (#344). The architecture decision's Better Auth setup (#333), as
// close as a prototype gets: no Owner, role read per request, cookie cache off,
// database rate limits, email code + password + Google, Turnstile, HIBP.
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { captcha, emailOTP, haveIBeenPwned, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import * as schema from "./schema";

// Turnstile's published always-pass test secret; real network call to siteverify.
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_SITEKEY = "1x00000000000000000000AA";
export const TURNSTILE_DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

// In-memory outbox standing in for Resend. `failSends` simulates Resend's 429.
type Mail = { to: string; kind: string; code?: string; url?: string; at: number };
const g = globalThis as unknown as { _outbox?: { mail: Mail[]; failSends: boolean } };
export const outbox = (g._outbox ??= { mail: [], failSends: false });
function send(mail: Omit<Mail, "at">) {
  if (outbox.failSends) throw new Error("Resend 429 daily_quota_exceeded (simulated)");
  outbox.mail.push({ ...mail, at: Date.now() });
}

const statements = {
  organization: ["update", "delete"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  request: ["create", "change", "comment"],
} as const;
export const ac = createAccessControl(statements);
export const roles = {
  admin: ac.newRole({ organization: ["update"], member: ["create", "update", "delete"], invitation: ["create", "cancel"], request: ["create", "change", "comment"] }),
  member: ac.newRole({ request: ["create", "change", "comment"] }),
  guest: ac.newRole({ request: ["create", "comment"] }),
  viewer: ac.newRole({}),
};

// Better Auth always accepts its built-in role names (owner, admin, member) on
// invite and role change, even when roles are customised. Lane's allow-list.
const LANE_ROLES = new Set(["admin", "member", "guest", "viewer"]);
function laneRolesOnly(role: string | string[]) {
  const list = (Array.isArray(role) ? role : role.split(",")).map((r) => r.trim());
  if (list.length !== 1 || !LANE_ROLES.has(list[0])) throw new APIError("BAD_REQUEST", { message: "That role doesn't exist in Lane." });
}
const roleGuard = process.env.PROTO_ROLE_GUARD !== "off";

const imageMode = process.env.PROTO_GOOGLE_IMAGE ?? "undefined"; // "undefined" | "null" | "keep"

export const auth = betterAuth({
  baseURL: "http://localhost:3344",
  secret: "prototype-344-not-a-secret-prototype-344-not-a-secret",
  database: drizzleAdapter(db, { provider: "pg", schema: { ...schema } }),
  user: {
    modelName: "profiles",
    fields: { name: "fullName" },
    additionalFields: { role: { type: "string", input: false, defaultValue: "designer", required: false } },
  },
  emailAndPassword: { enabled: true, minPasswordLength: 8, requireEmailVerification: true, autoSignIn: false },
  socialProviders: {
    google: {
      clientId: "prototype-344.apps.googleusercontent.com",
      clientSecret: "prototype-344",
      ...(imageMode === "keep" ? {} : { mapProfileToUser: () => ({ image: imageMode === "null" ? null : undefined }) as never }),
    },
  },
  // Lane never stores a picture: blank image on every user write, whatever the path.
  ...(process.env.PROTO_IMAGE_HOOK === "on" ? {
    databaseHooks: {
      user: {
        create: { before: async (user) => ({ data: { ...user, image: null } }) },
        update: { before: async (user) => ({ data: "image" in user ? { ...user, image: null } : user }) },
      },
    },
  } : {}),
  account: { accountLinking: { enabled: true, trustedProviders: ["google"] } },
  rateLimit: {
    enabled: process.env.PROTO_RATE_LIMIT !== "off",
    storage: "database",
    customRules: { "/email-otp/send-verification-otp": { window: 600, max: 3 } },
  },
  advanced: {
    ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] },
    ...(process.env.PROTO_SCHEMA === "lean" ? { database: { validateSchema: false } } : {}),
  },
  plugins: [
    organization({
      ac,
      roles,
      creatorRole: "admin",
      disableOrganizationDeletion: true,
      requireEmailVerificationOnInvitation: true,
      invitationExpiresIn: 7 * 24 * 60 * 60,
      schema: {
        organization: {
          modelName: "organizations",
          additionalFields: {
            plan: { type: "string", input: false, required: false, defaultValue: "free" },
            lastRequestNumber: { type: "number", input: false, required: false, defaultValue: 0 },
          },
        },
      },
      organizationHooks: roleGuard ? {
        beforeCreateInvitation: async ({ invitation }) => laneRolesOnly(invitation.role),
        beforeUpdateMemberRole: async ({ newRole }) => laneRolesOnly(newRole),
      } : undefined,
      sendInvitationEmail: async (d) => send({ to: d.email, kind: "invitation", url: `/invite/${d.id}` }),
    }),
    emailOTP({
      disableSignUp: true,
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      sendVerificationOTP: async ({ email, otp, type }) => send({ to: email, kind: type, code: otp }),
    }),
    ...(process.env.PROTO_CAPTCHA === "off" ? [] : [captcha({
      provider: "cloudflare-turnstile",
      secretKey: TURNSTILE_TEST_SECRET,
      endpoints: [
        "/sign-up/email", "/sign-in/email", "/request-password-reset",
        "/email-otp/send-verification-otp", "/sign-in/email-otp",
        "/email-otp/request-password-reset", "/email-otp/reset-password",
      ],
    })]),
    haveIBeenPwned(),
    ...(process.env.PROTO_NEXT ? [nextCookies()] : []),
  ],
});
