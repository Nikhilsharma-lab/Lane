import { and, eq, max } from "drizzle-orm";
import { requestExpectedImpactRevisions } from "@/db";
import type { RequestTx } from "@/lib/request-change-store";
import type { ExpectedImpact } from "@/lib/request-impact";

/**
 * Keeps an agreed Expected impact revision after a change to a Request's impact.
 * Call it inside the same transaction as the update, with the editor's identity from the guard.
 * Creation is recorded by the database (migration 0035), not here.
 */
export async function recordExpectedImpactRevision(
  tx: RequestTx,
  change: { orgId: string; requestId: string; expectedImpact: ExpectedImpact; authorId: string },
) {
  const [latest] = await tx
    .select({ revision: max(requestExpectedImpactRevisions.revision) })
    .from(requestExpectedImpactRevisions)
    .where(and(eq(requestExpectedImpactRevisions.orgId, change.orgId), eq(requestExpectedImpactRevisions.requestId, change.requestId)));
  await tx.insert(requestExpectedImpactRevisions).values({
    orgId: change.orgId,
    requestId: change.requestId,
    revision: Number(latest?.revision ?? 0) + 1,
    expectedImpact: change.expectedImpact,
    authorId: change.authorId,
    recordedAs: "revised",
  });
}
