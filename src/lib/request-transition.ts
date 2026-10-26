import "server-only";
import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, requests } from "@/db";
import { notify } from "@/lib/notify";
import { guardCanChange } from "@/lib/auth-guard";
import { MOVES, moveRefusal, type LifecycleMove } from "@/lib/request-lifecycle";
import { measurementReadiness } from "@/lib/request-measurement";
import { guestPickupRefusal, guestSubmissionOf } from "@/lib/guest-submission";
import { workspaceRoster } from "@/lib/workspace-roster";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Members and admins change Requests; guests and anyone outside the
 * workspace get this instead of "Not found", which is kept for a Request that
 * is missing or belongs to another workspace. */
export const CANNOT_CHANGE_REQUESTS = "You can't change Requests in this workspace.";
const MEMBERSHIP_UNVERIFIED = "Could not verify active workspace membership. Try again.";

/** The most rows one move accepts: a page of the list at its largest. */
const BULK_LIMIT = 50;

export type TransitionOutcome = {
  error?: string;
  sessionExpired?: true;
  /** Ids the statement moved; their notifications were written with them. */
  moved: string[];
  /** Ids it did not move, each with the reason a person can act on. */
  failed: { id: string; error: string }[];
};

/**
 * Pick up or Mark Done for one Request or a page of them. A single move is a
 * bulk move of one, so both say the same thing for the same reason.
 *
 * Inside one transaction the Requests are locked, every refusal is decided on
 * the locked rows (`moveRefusal`: closed, no longer in the from-status, or not
 * ready to pick up), and the rest move in ONE data-modifying CTE (plan items
 * 1.4 and 1.6). The CTE's UPDATE keeps the status and readiness guards and
 * public.notify reads its RETURNING rows, so a Request and its notification
 * commit or fail together (decision 8.17), a race can only win once, and a
 * self-move writes no notification (notify never tells the actor).
 */
export async function transitionRequests(move: LifecycleMove, requestIds: unknown, context: { orgId: string }): Promise<TransitionOutcome> {
  const transition = MOVES[move];
  // Never trust the client's ids: anything but a string is dropped.
  const unique = [...new Set((Array.isArray(requestIds) ? requestIds : []).filter((id): id is string => typeof id === "string"))];
  const valid = unique.filter((id) => UUID_RE.test(id)).slice(0, BULK_LIMIT);
  const invalid = unique.filter((id) => !valid.includes(id)).map((id) => ({ id, error: "Not found" }));
  const auth = await guardCanChange(context.orgId, CANNOT_CHANGE_REQUESTS);
  if ("error" in auth) {
    return { ...auth, moved: [], failed: unique.map((id) => ({ id, error: auth.error })) };
  }
  if (!valid.length) return { moved: [], failed: invalid };

  // The live roster, so a member removed since their session began cannot move work.
  let isMember = false;
  try {
    isMember = (await workspaceRoster(auth.orgId)).some((p) => p.nominee.kind === "member" && p.nominee.userId === auth.userId);
  } catch {
    /* Fail closed, with a recoverable message below. */
  }

  const outcome = await db.transaction(async (tx) => {
    // Locked in id order so concurrent bulk moves cannot deadlock; a concurrent
    // reviewer or plan change waits for this one or lands before it.
    const rows = await tx
      .select({ id: requests.id, status: requests.status, exceptionClosure: requests.exceptionClosure, outcomeClosure: requests.outcomeClosure, expectedImpact: requests.expectedImpact, requestType: requests.requestType, noMeasurableImpactReason: requests.noMeasurableImpactReason, guestSubmission: requests.guestSubmission, takenOnBy: requests.takenOnBy })
      .from(requests)
      .where(and(eq(requests.orgId, auth.orgId), inArray(requests.id, valid)))
      .orderBy(asc(requests.id))
      .for("update");
    const eligible: string[] = [];
    const failed = [...invalid];
    for (const id of valid) {
      const row = rows.find((r) => r.id === id);
      const error = !row ? "Not found"
        : moveRefusal({ ...row, pickupBlockedReason: null }, move)
          ?? (isMember ? null : MEMBERSHIP_UNVERIFIED)
          // #212: a Guest submission is taken on, and its prediction written, before anyone picks it up.
          ?? (move === "pick-up" ? guestPickupRefusal({ ...row, guestSubmission: guestSubmissionOf(row) }) ?? measurementReadiness(row.expectedImpact, row.requestType) : null);
      if (error) failed.push({ id, error });
      else eligible.push(id);
    }
    if (!eligible.length) return { moved: [], failed };

    // Validated UUIDs only, so the array literal is one bound parameter.
    const ids = `{${eligible.join(",")}}`;
    const assignment = transition.to === "in_progress"
      ? sql`"status" = ${transition.to}::request_status, "assigned_to" = ${auth.userId}`
      : sql`"status" = ${transition.to}::request_status`;
    const readiness = transition.to === "in_progress"
      ? sql`public.request_measurement_ready(${requests.expectedImpact}, ${requests.requestType}::text)`
      : sql`true`;
    const updated = await tx.execute<{ id: string }>(sql`
      with u as (
        update ${requests}
        set ${assignment}
        where ${requests.id} = any(${ids}::uuid[])
          and ${requests.orgId} = ${auth.orgId}
          and ${requests.status} = ${transition.from}::request_status
          and ${readiness}
        returning ${requests.id}, ${requests.orgId}, ${requests.createdBy}
      ), n as (
        select ${notify([sql`u.created_by`], sql`u.org_id`, move === "pick-up" ? "request_picked_up" : "request_done", sql`u.id`, auth.userId)} as sent
        from u
      )
      -- Reading n runs it: a plain CTE is evaluated only when read.
      select u.id as id from u where (select count(*) from n) >= 0
    `);
    const moved = updated.map((row) => row.id);
    // The rows are locked and were checked above, so a miss here means the
    // database's readiness rule disagreed with Lane's: say so without guessing.
    for (const id of eligible) if (!moved.includes(id)) failed.push({ id, error: `This Request changed before Lane could ${transition.verb}. Refresh and try again.` });
    return { moved, failed };
  });

  if (outcome.moved.length) {
    revalidatePath("/");
    for (const id of outcome.moved) revalidatePath(`/requests/${id}`);
  }
  return outcome;
}
