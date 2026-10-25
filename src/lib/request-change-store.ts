import "server-only";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, requests } from "@/db";
import {
  workspaceRoster,
  type WorkspacePerson,
} from "./workspace-roster";
import { requireCanChange, type MemberAuth, refusal } from "./auth-guard";
import {
  requestChangeContextSchema,
  type RequestChangeContext,
} from "./request-reviewer-rules";
export type RequestTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class RequestChangeError extends Error {}
export function insist(value: unknown, message: string): asserts value {
  if (!value) throw new RequestChangeError(message);
}
export type StoredRequest = typeof requests.$inferSelect;
export type ChangeResult<Extra = object> = { success: true; revision: number } & Extra;

/** Identifies one change so a retried operation replays instead of applying twice. */
export function fingerprintOf(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export const STALE_REQUEST = "Request changed. Reload before trying again.";

export type RequestChange<Extra> = {
  /** Hashed into the fingerprint a retried operation must match. */
  fingerprint: unknown;
  messages: {
    /** The context failed validation. */
    invalid: string;
    /** The caller isn't a member or admin of the workspace. */
    forbidden: string;
    /** Anything unexpected; the input stays in the form. */
    failed: string;
  };
  /** This operation's earlier save, from wherever the change records it, so a
   * retry returns what the first attempt did. */
  replayOf: (
    tx: RequestTx,
    request: StoredRequest,
    auth: MemberAuth,
  ) => Promise<{ actorId: string; fingerprint: string; result: ChangeResult<Extra> } | undefined> | { actorId: string; fingerprint: string; result: ChangeResult<Extra> } | undefined;
  /** False for a change that never writes this Request (a follow-up): no
   * revision check and no revision bump. */
  revises?: boolean;
  /** The change's own rule and writes, on the locked Request. Refuse with
   * `insist`. `set` is written to the Request with its new revision in one
   * update; `result` joins the success answer. */
  apply: (
    tx: RequestTx,
    step: { request: StoredRequest; auth: MemberAuth; roster: WorkspacePerson[]; revision: number; fingerprint: string },
  ) => Promise<{ set?: Partial<typeof requests.$inferInsert>; result?: Extra } | void>;
};

/**
 * The one way a lifecycle change after creation is saved: reviewers, release,
 * outcome and follow-ups. It checks the context and the caller (a member or
 * admin who is still on the live roster), locks the Request, replays a retried
 * operation, refuses a stale revision, runs the change's rule, writes the next
 * revision with the change, and revalidates. Every refusal is `{ error }`
 * with the rule's own copy.
 */
export async function changeRequest<Extra extends object = object>(
  context: RequestChangeContext,
  change: RequestChange<Extra>,
): Promise<ChangeResult<Extra> | { error: string }> {
  try {
    insist(requestChangeContextSchema.safeParse(context).success, change.messages.invalid);
    const auth = await requireCanChange(context.orgId);
    insist(auth, await refusal(change.messages.forbidden));
    // Fetched before locking; Clerk and Postgres cannot share a transaction.
    const roster = await workspaceRoster(auth.orgId);
    insist(
      roster.some((p) => p.nominee.kind === "member" && p.nominee.userId === auth.userId),
      "Your workspace membership is no longer active.",
    );
    const fingerprint = fingerprintOf(change.fingerprint);
    const result = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(requests)
        .where(and(eq(requests.id, context.requestId), eq(requests.orgId, auth.orgId)))
        .for("update");
      insist(request, "Request unavailable.");
      const previous = await change.replayOf(tx, request, auth);
      if (previous) {
        insist(
          previous.actorId === auth.userId && previous.fingerprint === fingerprint,
          "This retry key was used for another change.",
        );
        return previous.result;
      }
      const revises = change.revises !== false;
      if (revises) insist(request.agreementRevision === context.expectedRevision, STALE_REQUEST);
      const revision = request.agreementRevision + 1;
      const applied = (await change.apply(tx, { request, auth, roster, revision, fingerprint })) ?? {};
      if (revises)
        await tx
          .update(requests)
          .set({ ...applied.set, agreementRevision: revision })
          .where(and(eq(requests.id, request.id), eq(requests.orgId, auth.orgId)));
      return { success: true as const, revision, ...applied.result } as ChangeResult<Extra>;
    });
    revalidatePath("/");
    revalidatePath(`/requests/${context.requestId}`);
    return result;
  } catch (error) {
    return { error: error instanceof RequestChangeError ? error.message : change.messages.failed };
  }
}
