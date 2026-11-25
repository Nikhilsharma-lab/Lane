import "server-only"
import { randomUUID } from "node:crypto"
import { and, desc, eq, gt, sql } from "drizzle-orm"
import { db, invitation, rateLimit } from "@/db"

/** #349 (Nikhil, 2026-11-25): what one person may send in any 24 hours, across all their workspaces. */
const INVITATIONS_A_DAY = 30
const DAY_MS = 24 * 60 * 60 * 1000
/** Longer than an invitation and its email take; a server that stopped midway holds its place no longer than this. */
const IN_HAND_MS = 60 * 1000
const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

const inHandPrefix = (userId: string) => `lane-invites:${userId}:`

/**
 * Takes one of the person's 30, answering how to give the place back, or how long until one is free. It counts their
 * invitation rows, cancelled ones too (a refused invitation leaves none), and the invitations in hand: Better Auth
 * writes its row later, in a call of its own. Those are kept in Better Auth's rate_limit table for as long as they take.
 * A membership turn (membership-turn.ts) would count too, but would hold every other change while an email is sent.
 */
async function takePlace(userId: string): Promise<{ place: string } | { freeInMs: number }> {
  const prefix = inHandPrefix(userId)
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${prefix}))`)
    const now = Date.now()
    const sent = await tx
      .select({ at: invitation.createdAt })
      .from(invitation)
      .where(and(eq(invitation.inviterId, userId), gt(invitation.createdAt, new Date(now - DAY_MS))))
      .orderBy(desc(invitation.createdAt))
      .limit(INVITATIONS_A_DAY)
    const inHand = await tx.$count(rateLimit, and(sql`starts_with(${rateLimit.key}, ${prefix})`, gt(rateLimit.lastRequest, now - IN_HAND_MS)))
    const oldest = sent[INVITATIONS_A_DAY - 1]
    if (oldest) return { freeInMs: oldest.at.getTime() + DAY_MS - now }
    if (sent.length + inHand >= INVITATIONS_A_DAY) return { freeInMs: IN_HAND_MS }
    const place = prefix + randomUUID()
    await tx.insert(rateLimit).values({ id: randomUUID(), key: place, count: 1, lastRequest: now })
    return { place }
  })
}

const counted = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`

/** Rounded up, so it's true when they try again. The server doesn't know their clock. */
function wait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / MINUTE_MS))
  return minutes < 60 ? counted(minutes, "minute") : counted(Math.ceil(ms / HOUR_MS), "hour")
}

/** Runs `invite` as one of the person's 30 invitations in 24 hours, or says when they can invite again. */
export async function withinInvitationAllowance<T>(userId: string, invite: () => Promise<T>): Promise<T | { error: string }> {
  const taken = await takePlace(userId)
  // Proposed for Nikhil.
  if ("freeInMs" in taken) return { error: `You’ve sent ${INVITATIONS_A_DAY} invitations in the last 24 hours, Lane’s limit. You can invite again in ${wait(taken.freeInMs)}.` }
  try {
    return await invite()
  } finally {
    await db.delete(rateLimit).where(eq(rateLimit.key, taken.place))
  }
}
