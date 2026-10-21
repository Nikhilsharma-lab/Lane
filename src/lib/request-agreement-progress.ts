import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, requests, requestAgreements, requestReplacements } from "@/db";
import { agreementBlockReason, disciplines } from "./request-agreement";
import { agreementRoster } from "./request-agreement-members";
import type { AgreementTx } from "./request-agreement-store";
/** Shares Request row locks with withdrawal, superseding and commitment edits. */
export async function withAgreementProgress<T>(
  orgId: string,
  userId: string,
  ids: string[],
  from: "open" | "in_progress",
  operation: (
    tx: AgreementTx,
    eligible: string[],
    blocked: { id: string; error: string }[],
  ) => Promise<T>,
): Promise<T> {
  let members: Set<string> | null = null;
  try {
    members = new Set(
      (await agreementRoster(orgId)).flatMap((p) =>
        p.nominee.kind === "member" ? [p.nominee.userId] : [],
      ),
    );
  } catch {
    /* Fail closed, with a recoverable message below. */
  }
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(requests)
      .where(and(eq(requests.orgId, orgId), inArray(requests.id, ids)))
      .orderBy(asc(requests.id))
      .for("update");
    const agreements = await tx
      .select()
      .from(requestAgreements)
      .where(
        and(
          eq(requestAgreements.orgId, orgId),
          inArray(requestAgreements.requestId, ids),
        ),
      );
    const links = await tx
      .select()
      .from(requestReplacements)
      .where(
        and(
          eq(requestReplacements.orgId, orgId),
          inArray(requestReplacements.replacementId, ids),
        ),
      );
    const eligible: string[] = [];
    const blocked: { id: string; error: string }[] = [];
    for (const id of ids) {
      const request = rows.find((r) => r.id === id);
      const agreement = agreements.find((a) => a.requestId === id);
      const incoming = links.find((l) => l.replacementId === id);
      let error: string | null = null;
      if (!request) error = "Not found";
      else if (request.exceptionClosure)
        error = request.exceptionClosure.reasonCode === "superseded"
          ? "This Request is Superseded and cannot advance."
          : "This Request is closed with an exception and cannot advance.";
      else if (request.outcomeClosure)
        error = "This Request is Closed and cannot advance.";
      else if (request.status !== from) {
        eligible.push(id);
        continue;
      } else if (incoming && !incoming.confirmedAt)
        error =
          "Confirm the original as Superseded before advancing this replacement.";
      else if (request.status === "open" || agreement?.snapshot)
        error = agreementBlockReason(agreement);
      if (!error && (!members || !members.has(userId)))
        error = "Could not verify active workspace membership. Try again.";
      if (
        !error &&
        agreement?.snapshot &&
        disciplines.some((d) => {
          const n = agreement.seats[d]?.nominee;
          return n?.kind !== "member" || !members?.has(n.userId);
        })
      )
        error =
          "Agreement blocked: a participant is no longer an active member.";
      if (error) blocked.push({ id, error });
      else eligible.push(id);
    }
    return operation(tx, eligible, blocked);
  });
}
