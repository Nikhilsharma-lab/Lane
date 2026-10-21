import "server-only";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  db,
  requests,
  requestAgreements,
  requestAgreementEvents,
} from "@/db";
import {
  workspaceRoster,
  type WorkspacePerson,
} from "./workspace-roster";
import { requireMemberOrAbove, type MemberAuth } from "./auth-guard";
import {
  requestChangeContextSchema,
  type RequestChangeContext,
} from "./request-reviewer-rules";
export type RequestTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class RequestChangeError extends Error {}
export function insist(value: unknown, message: string): asserts value {
  if (!value) throw new RequestChangeError(message);
}
export type ReviewersRow = typeof requestAgreements.$inferSelect;
export type StoredRequest = typeof requests.$inferSelect;
export async function mutateReviewers(
  context: RequestChangeContext,
  input: unknown,
  kind: string,
  change: (
    tx: RequestTx,
    request: StoredRequest,
    reviewersRow: ReviewersRow | undefined,
    auth: MemberAuth,
    roster: WorkspacePerson[],
  ) => Promise<void>,
) {
  try {
    const parsed = requestChangeContextSchema.safeParse(context);
    insist(parsed.success, "Invalid review action.");
    const auth = await requireMemberOrAbove(context.orgId);
    insist(auth, "You cannot change reviews in this workspace.");
    // Fetched before locking; Clerk and Postgres cannot share a transaction.
    const roster = await workspaceRoster(auth.orgId);
    insist(
      roster.some(
        (p) => p.nominee.kind === "member" && p.nominee.userId === auth.userId,
      ),
      "Your workspace membership is no longer active.",
    );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ requestId: context.requestId, kind, input }))
      .digest("hex");
    const result = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(requests)
        .where(
          and(
            eq(requests.id, context.requestId),
            eq(requests.orgId, auth.orgId),
          ),
        )
        .for("update");
      insist(request, "Request unavailable.");
      const [previous] = await tx
        .select()
        .from(requestAgreementEvents)
        .where(
          and(
            eq(requestAgreementEvents.orgId, auth.orgId),
            eq(requestAgreementEvents.actorId, auth.userId),
            eq(requestAgreementEvents.operationId, context.operationId),
          ),
        );
      if (previous) {
        insist(
          previous.payload.fingerprint === fingerprint,
          "This retry key was used for another change.",
        );
        return previous.payload.result;
      }
      insist(
        request.status === "open",
        "Work has started. Reviews can no longer change.",
      );
      insist(
        request.agreementRevision === context.expectedRevision,
        "Reviews changed. Reload before trying again.",
      );
      const [reviewersRow] = await tx
        .select()
        .from(requestAgreements)
        .where(
          and(
            eq(requestAgreements.requestId, request.id),
            eq(requestAgreements.orgId, auth.orgId),
          ),
        );
      const before = reviewersRow ? structuredClone(reviewersRow) : null;
      await change(tx, request, reviewersRow, auth, roster);
      const revision = request.agreementRevision + 1;
      await tx
        .update(requests)
        .set({ agreementRevision: revision })
        .where(
          and(eq(requests.id, request.id), eq(requests.orgId, auth.orgId)),
        );
      const result = { success: true as const, revision };
      const [after] = await tx
        .select()
        .from(requestAgreements)
        .where(
          and(
            eq(requestAgreements.requestId, request.id),
            eq(requestAgreements.orgId, auth.orgId),
          ),
        );
      await tx
        .insert(requestAgreementEvents)
        .values({
          orgId: auth.orgId,
          requestId: request.id,
          revision,
          operationId: context.operationId,
          actorId: auth.userId,
          kind,
          payload: { version: 1, fingerprint, input, before, after, result },
        });
      return result;
    });
    revalidatePath("/");
    revalidatePath(`/requests/${context.requestId}`);
    return result;
  } catch (error) {
    return {
      error:
        error instanceof RequestChangeError
          ? error.message
          : "Couldn’t save the review. Your input is preserved; try again.",
    };
  }
}
/** Identifies one change so a retried operation replays instead of applying twice. */
export function fingerprintOf(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
