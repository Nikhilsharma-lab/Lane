import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { and, eq, gt, sql } from "drizzle-orm"
import { db, member, session } from "@/db"
import { betterAuthServer } from "./feature-switches"
import { isWorkspacePermission } from "./role-rules"
import type { Session } from "./session"

/** A request's cookies, as Next's `cookies()` hands them to server code. */
type RequestCookies = { get(name: string): { value: string } | undefined }

// Better Auth adds the __Secure- prefix when its URL is https (staging, production). Like its getSessionCookie,
// the read takes that cookie first and the plain one second; the signature is what's trusted, not the name.
const SESSION_COOKIES = ["__Secure-better-auth.session_token", "better-auth.session_token"]

/**
 * #374 (spec #369): the signed-in person, their active workspace and their Lane role from Better Auth's session, in
 * the session seam's own `Session` shape and one query. Dormant: nothing imports it until increment 5 makes
 * `readSession` call it (lint enforces this).
 *
 * - No cookie, a signature that isn't Better Auth's, an unknown token or an expired session: null.
 * - The active workspace counts only with the person's member row in it. Better Auth leaves a removed person's
 *   `active_organization_id` in place (#344), so without the row `orgId` and `role` are null.
 * - A role Lane doesn't know is null: no access, as `clerkWorkspacePermission` does on the Clerk side.
 * - It never renews the session. Better Auth's own session calls do that; increment 5 decides where they run.
 */
export async function readBetterAuthSession(cookies: RequestCookies): Promise<Session | null> {
  const server = betterAuthServer()
  const value = SESSION_COOKIES.map((name) => cookies.get(name)?.value).find(Boolean)
  if (!server.on || !value) return null
  const token = verifiedToken(value, server.secret)
  if (!token) return null
  const [row] = await db
    .select({ userId: session.userId, orgId: member.organizationId, role: member.role })
    .from(session)
    .leftJoin(member, and(eq(member.userId, session.userId), eq(member.organizationId, session.activeOrganizationId)))
    .where(and(eq(session.token, token), gt(session.expiresAt, sql`now()`)))
    .limit(1)
  if (!row) return null
  return { userId: row.userId, orgId: row.orgId, role: row.role && isWorkspacePermission(row.role) ? row.role : null }
}

/**
 * The session token in a cookie Better Auth signed, or null when the signature isn't Better Auth's. The cookie holds
 * `token.signature`, the signature being HMAC-SHA256 of the token under BETTER_AUTH_SECRET in padded base64 (44
 * characters), as better-call's `getSignedCookie` checks it.
 */
function verifiedToken(cookie: string, secret: string): string | null {
  let value: string
  try {
    value = decodeURIComponent(cookie)
  } catch {
    return null
  }
  const dot = value.lastIndexOf(".")
  if (dot < 1) return null
  const [token, signature] = [value.slice(0, dot), Buffer.from(value.slice(dot + 1))]
  const expected = Buffer.from(createHmac("sha256", secret).update(token).digest("base64"))
  return signature.length === expected.length && timingSafeEqual(signature, expected) ? token : null
}
