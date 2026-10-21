import "server-only";
import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { and, eq, inArray, asc } from "drizzle-orm";
import {
  db,
  requests,
  requestAgreements,
  requestAgreementEvents,
  requestReplacements,
} from "@/db";
import { agreementRoster } from "./request-agreement-members";
import { requireMemberOrAbove, type MemberAuth } from "./auth-guard";
import {
  agreementContextSchema,
  type AgreementContext,
  type ExceptionClosure,
} from "./request-agreement";
export type AgreementTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export class AgreementError extends Error {}
export function insist(value: unknown, message: string): asserts value {
  if (!value) throw new AgreementError(message);
}
export type AgreementRow = typeof requestAgreements.$inferSelect;
export type AgreementRequest = typeof requests.$inferSelect;
export async function mutateAgreement(
  context: AgreementContext,
  input: unknown,
  kind: string,
  creatorOnly: boolean,
  change: (
    tx: AgreementTx,
    request: AgreementRequest,
    agreement: AgreementRow | undefined,
    auth: MemberAuth,
  ) => Promise<{ replacementId?: string; closure?: ExceptionClosure } | void>,
) {
  try {
    const parsed = agreementContextSchema.safeParse(context);
    insist(parsed.success, "Invalid agreement action.");
    const auth = await requireMemberOrAbove(context.orgId);
    insist(auth, "You cannot change agreement in this workspace.");
    if (creatorOnly)
      insist(
        (await agreementRoster(auth.orgId)).some(
          (p) =>
            p.nominee.kind === "member" && p.nominee.userId === auth.userId,
        ),
        "Your workspace membership is no longer active.",
      );
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ requestId: context.requestId, kind, input }))
      .digest("hex");
    const result = await db.transaction(async (tx) => {
      const link =
        kind === "superseded"
          ? (
              await tx
                .select()
                .from(requestReplacements)
                .where(
                  and(
                    eq(requestReplacements.originalId, context.requestId),
                    eq(requestReplacements.orgId, auth.orgId),
                  ),
                )
            )[0]
          : undefined;
      const locked = await tx
        .select()
        .from(requests)
        .where(
          and(
            inArray(
              requests.id,
              link
                ? [context.requestId, link.replacementId]
                : [context.requestId],
            ),
            eq(requests.orgId, auth.orgId),
          ),
        )
        .orderBy(asc(requests.id))
        .for("update");
      const request = locked.find((r) => r.id === context.requestId);
      insist(request, "Request unavailable.");
      if (creatorOnly)
        insist(
          request.createdBy === auth.userId,
          "Only the Request creator can do this.",
        );
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
        !request.exceptionClosure,
        "This Request is permanently closed as Superseded.",
      );
      insist(
        request.agreementRevision === context.expectedRevision,
        "Agreement changed. Reload before trying again.",
      );
      const [agreement] = await tx
        .select()
        .from(requestAgreements)
        .where(
          and(
            eq(requestAgreements.requestId, request.id),
            eq(requestAgreements.orgId, auth.orgId),
          ),
        );
      const before = agreement ? structuredClone(agreement) : null;
      const extra = await change(tx, request, agreement, auth);
      const revision = request.agreementRevision + 1;
      await tx
        .update(requests)
        .set({
          agreementRevision: revision,
          ...(extra?.closure ? { exceptionClosure: extra.closure } : {}),
        })
        .where(
          and(eq(requests.id, request.id), eq(requests.orgId, auth.orgId)),
        );
      const result = {
        success: true as const,
        revision,
        ...(extra?.replacementId ? { replacementId: extra.replacementId } : {}),
      };
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
    if (result.replacementId)
      revalidatePath(`/requests/${result.replacementId}`);
    return result;
  } catch (error) {
    return {
      error:
        error instanceof AgreementError
          ? error.message
          : "Couldn’t save agreement. Your input is preserved; try again.",
    };
  }
}
export function commitmentToken(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
