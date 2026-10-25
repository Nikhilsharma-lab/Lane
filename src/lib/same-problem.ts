import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import { db, profiles, requests, sameProblemEvents, sameProblemMembers } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { seeable } from "@/lib/request-access";
import { FORMER_MEMBER } from "@/lib/request-journey";

/**
 * Same problem links (#218). Groups live in `same_problem_members` (one group at most per Request); each Request's
 * history in `same_problem_events`. Nothing on `requests` is written, so a Closed record never changes. Access is
 * the caller's job: actions guard the role first and pass the guard's `auth`; rows are still read through `seeable`.
 */

export type SameProblemRefusal = { error: string };

export const SAME_PROBLEM_COPY = {
  self: "A Request can’t be linked to itself.",
  already: "These Requests are already linked as Same problem.",
  unavailable: "That Request isn’t available.",
  notLinked: "This Request isn’t linked as Same problem.",
} as const;

/** One line of a Request's link history: who linked it with which Request, or took it out, and when. */
export type SameProblemHistoryLine = {
  id: string;
  kind: "linked" | "removed";
  actorName: string;
  at: string;
  /** Linked: the Request it was linked with. Removed: null when this Request was taken out, else the Request whose removal ended its group. */
  other: { requestId: string; requestNumber: number } | null;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Every link change in a workspace waits for the one before, so two people combining groups can't split one. */
async function lockWorkspaceLinks(tx: Tx, orgId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`same_problem:${orgId}`}))`);
}

/** Links two Requests as Same problem: their groups join (both grouped: the groups combine). Recorded on both. */
export async function linkRequests(auth: MemberAuth, requestId: string, otherRequestId: string): Promise<{ success: true } | SameProblemRefusal> {
  if (requestId === otherRequestId) return { error: SAME_PROBLEM_COPY.self };
  return db.transaction(async (tx) => {
    await lockWorkspaceLinks(tx, auth.orgId);
    const found = await tx.select({ id: requests.id, requestNumber: requests.requestNumber }).from(requests)
      .where(and(inArray(requests.id, [requestId, otherRequestId]), seeable(auth)));
    const self = found.find(row => row.id === requestId), other = found.find(row => row.id === otherRequestId);
    if (!self || !other) return { error: SAME_PROBLEM_COPY.unavailable };

    const memberships = await tx.select({ requestId: sameProblemMembers.requestId, groupId: sameProblemMembers.groupId }).from(sameProblemMembers)
      .where(and(eq(sameProblemMembers.orgId, auth.orgId), inArray(sameProblemMembers.requestId, [requestId, otherRequestId])));
    const groupOf = (id: string) => memberships.find(row => row.requestId === id)?.groupId ?? null;
    const [mine, theirs] = [groupOf(requestId), groupOf(otherRequestId)];
    if (mine && mine === theirs) return { error: SAME_PROBLEM_COPY.already };

    const join = (id: string, groupId: string) => ({ orgId: auth.orgId, requestId: id, groupId, addedBy: auth.userId });
    if (mine && theirs) {
      await tx.update(sameProblemMembers).set({ groupId: mine }).where(and(eq(sameProblemMembers.orgId, auth.orgId), eq(sameProblemMembers.groupId, theirs)));
    } else if (mine || theirs) {
      await tx.insert(sameProblemMembers).values(mine ? join(otherRequestId, mine) : join(requestId, theirs!));
    } else {
      const groupId = randomUUID();
      await tx.insert(sameProblemMembers).values([join(requestId, groupId), join(otherRequestId, groupId)]);
    }
    await tx.insert(sameProblemEvents).values([
      { orgId: auth.orgId, requestId, kind: "linked", otherRequestId, otherRequestNumber: other.requestNumber, actorId: auth.userId },
      { orgId: auth.orgId, requestId: otherRequestId, kind: "linked", otherRequestId: requestId, otherRequestNumber: self.requestNumber, actorId: auth.userId },
    ]);
    return { success: true as const };
  });
}

/**
 * Takes one Request out of its group; the rest stay linked. A group left with one Request ends (by trigger), and that
 * Request's history says so, naming the Request taken out.
 */
export async function unlinkRequest(auth: MemberAuth, requestId: string): Promise<{ success: true } | SameProblemRefusal> {
  return db.transaction(async (tx) => {
    await lockWorkspaceLinks(tx, auth.orgId);
    const [self] = await tx.select({ requestNumber: requests.requestNumber, groupId: sameProblemMembers.groupId }).from(requests)
      .innerJoin(sameProblemMembers, and(eq(sameProblemMembers.requestId, requests.id), eq(sameProblemMembers.orgId, auth.orgId)))
      .where(and(eq(requests.id, requestId), seeable(auth)));
    if (!self) return { error: SAME_PROBLEM_COPY.notLinked };
    const rest = await tx.select({ requestId: sameProblemMembers.requestId }).from(sameProblemMembers)
      .where(and(eq(sameProblemMembers.orgId, auth.orgId), eq(sameProblemMembers.groupId, self.groupId), ne(sameProblemMembers.requestId, requestId)));
    await tx.delete(sameProblemMembers).where(and(eq(sameProblemMembers.orgId, auth.orgId), eq(sameProblemMembers.requestId, requestId)));
    await tx.insert(sameProblemEvents).values([
      { orgId: auth.orgId, requestId, kind: "removed", otherRequestId: null, otherRequestNumber: null, actorId: auth.userId },
      ...rest.length === 1 ? [{ orgId: auth.orgId, requestId: rest[0].requestId, kind: "removed" as const, otherRequestId: requestId, otherRequestNumber: self.requestNumber, actorId: auth.userId }] : [],
    ]);
    return { success: true as const };
  });
}

/** The group a visible Request is in, or null; undefined when the viewer can't see the Request at all. */
export async function sameProblemGroupOf(auth: MemberAuth, requestId: string): Promise<string | null | undefined> {
  const [row] = await db.select({ groupId: sameProblemMembers.groupId }).from(requests)
    .leftJoin(sameProblemMembers, and(eq(sameProblemMembers.requestId, requests.id), eq(sameProblemMembers.orgId, auth.orgId)))
    .where(and(eq(requests.id, requestId), seeable(auth)));
  return row ? row.groupId : undefined;
}

/** A Request's link history, oldest first, each line with the name of who did it. */
export async function readSameProblemHistory(auth: MemberAuth, requestId: string): Promise<SameProblemHistoryLine[]> {
  const rows = await db.select({
    id: sameProblemEvents.id, kind: sameProblemEvents.kind, actorName: profiles.fullName, at: sameProblemEvents.createdAt,
    otherRequestId: sameProblemEvents.otherRequestId, otherRequestNumber: sameProblemEvents.otherRequestNumber,
  }).from(sameProblemEvents)
    .leftJoin(profiles, eq(profiles.id, sameProblemEvents.actorId))
    .where(and(eq(sameProblemEvents.orgId, auth.orgId), eq(sameProblemEvents.requestId, requestId)))
    .orderBy(asc(sameProblemEvents.createdAt), asc(sameProblemEvents.kind));
  return rows.map(row => ({
    id: row.id,
    kind: row.kind,
    actorName: row.actorName || FORMER_MEMBER,
    at: row.at.toISOString(),
    other: row.otherRequestId && row.otherRequestNumber ? { requestId: row.otherRequestId, requestNumber: row.otherRequestNumber } : null,
  }));
}
