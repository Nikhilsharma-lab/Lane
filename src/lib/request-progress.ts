import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, requests } from "@/db";
import { workspaceRoster } from "./workspace-roster";
import type { RequestTx } from "./request-change-store";
/**
 * Locks the Requests so a concurrent reviewer change cannot land after pickup.
 * Reviews never block: only a closure stops a Request advancing.
 */
export async function withRequestProgress<T>(
  orgId: string,
  userId: string,
  ids: string[],
  from: "open" | "in_progress",
  operation: (
    tx: RequestTx,
    eligible: string[],
    blocked: { id: string; error: string }[],
  ) => Promise<T>,
): Promise<T> {
  let members: Set<string> | null = null;
  try {
    members = new Set(
      (await workspaceRoster(orgId)).flatMap((p) =>
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
    const eligible: string[] = [];
    const blocked: { id: string; error: string }[] = [];
    for (const id of ids) {
      const request = rows.find((r) => r.id === id);
      let error: string | null = null;
      if (!request) error = "Not found";
      else if (request.exceptionClosure)
        error = "This Request is closed without a result and cannot advance.";
      else if (request.outcomeClosure)
        error = "This Request is Closed and cannot advance.";
      else if (request.status !== from) {
        eligible.push(id);
        continue;
      }
      if (!error && (!members || !members.has(userId)))
        error = "Could not verify active workspace membership. Try again.";
      if (error) blocked.push({ id, error });
      else eligible.push(id);
    }
    return operation(tx, eligible, blocked);
  });
}
