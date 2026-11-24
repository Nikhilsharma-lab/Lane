"use server";

import { and, eq, gt, sql } from "drizzle-orm";
import { db, session } from "@/db";
import type { AuthAnswer } from "@/lib/auth-answer";
import { guardActiveMember } from "@/lib/auth-guard";
import { askAuthServer } from "@/lib/auth-server";

/**
 * #394 (spec #383): Settings → Profile's account changes that can't go through the browser auth client, because
 * Better Auth sets a first password only on the server and a session's token never reaches the browser. Whose account
 * it is comes only from the session; each answers success or an error code, and nothing else.
 */
type Context = { orgId: string };

async function ownAccount({ orgId }: Context): Promise<{ userId: string } | { refused: AuthAnswer }> {
  const auth = await guardActiveMember(orgId, "");
  if (!("error" in auth)) return { userId: auth.userId };
  return { refused: { ok: false, code: auth.sessionExpired ? "UNAUTHORIZED" : "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION" } };
}

const done = (answer: AuthAnswer): AuthAnswer => (answer.ok ? { ok: true } : answer);

/** Sets the person's first password. Better Auth refuses it when they have one. */
export async function setFirstPassword(newPassword: string, context: Context): Promise<AuthAnswer> {
  const own = await ownAccount(context);
  if ("refused" in own) return own.refused;
  return done(await askAuthServer((api, asCaller) => api.setPassword({ ...asCaller, body: { newPassword } })));
}

/** Signs out one of the person's devices, by its session's id. An id that isn't one of theirs ends nothing. */
export async function signOutDevice(deviceId: string, context: Context): Promise<AuthAnswer> {
  const own = await ownAccount(context);
  if ("refused" in own) return own.refused;
  const [device] = typeof deviceId !== "string" ? [] : await db
    .select({ token: session.token })
    .from(session)
    .where(and(eq(session.id, deviceId), eq(session.userId, own.userId), gt(session.expiresAt, sql`now()`)));
  if (!device) return { ok: false, code: "DEVICE_NOT_FOUND" };
  return done(await askAuthServer((api, asCaller) => api.revokeSession({ ...asCaller, body: { token: device.token } })));
}

/** Signs out every device of the person's but this one. */
export async function signOutOtherDevices(context: Context): Promise<AuthAnswer> {
  const own = await ownAccount(context);
  if ("refused" in own) return own.refused;
  return done(await askAuthServer((api, asCaller) => api.revokeOtherSessions(asCaller)));
}
