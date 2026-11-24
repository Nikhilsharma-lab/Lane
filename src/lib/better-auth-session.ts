import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { and, asc, eq, gt, sql } from "drizzle-orm"
import { db, member, profiles, session } from "@/db"
import { betterAuthServer } from "./feature-switches"
import { isWorkspacePermission } from "./role-rules"
import type { Session } from "./session"
import { sessionCookie, type RequestCookies } from "./session-cookies"

/**
 * #374 (spec #369): the signed-in person, the workspace their session is in and their Lane role from Better Auth's
 * session, in the session seam's own `Session` shape and one query. Only the seam's `readSession` calls it (#387; lint
 * enforces this).
 *
 * - No cookie, a signature that isn't Better Auth's, an unknown token or an expired session: null.
 * - The workspace is the session's active one, else the person's last-used one, else their oldest membership, each
 *   only with their member row in it, else none (#333 Q12). Better Auth leaves a removed person's
 *   `active_organization_id` in place (#344), so a removal applies on the next read. The role is that row's.
 * - A role Lane doesn't know is null: no access, as for anyone without a member row.
 * - It never renews the session. Better Auth's own session calls do that.
 */
export async function readBetterAuthSession(cookies: RequestCookies): Promise<Session | null> {
  const server = betterAuthServer()
  const value = sessionCookie(cookies)
  if (!server.on || !value) return null
  const token = verifiedToken(value, server.secret)
  if (!token) return null
  const [row] = await db
    .select({ userId: session.userId, orgId: member.organizationId, role: member.role })
    .from(session)
    .innerJoin(profiles, eq(profiles.id, session.userId))
    .leftJoin(member, eq(member.userId, session.userId))
    .where(and(eq(session.token, token), gt(session.expiresAt, sql`now()`)))
    // One session, so one row per membership: the one its workspace comes from sorts first.
    .orderBy(
      sql`(${member.organizationId} = ${session.activeOrganizationId}) is true desc`,
      sql`(${member.organizationId} = ${profiles.lastWorkspaceId}) is true desc`,
      asc(member.createdAt),
      asc(member.id),
    )
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
