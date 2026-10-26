import { formatRequestCode } from "@/lib/request-code"
import { JOURNEY_STATUSES } from "@/lib/request-journey"
import type { WorkspaceSearchRequest } from "@/lib/workspace-search"

/** A Request "Link a Request" offers (#218). */
export type LinkCandidate = { requestId: string; code: string; title: string; status: string }

/** Search results to offer, in their order: never the Request itself, nor one already in its Same problem group. */
export function linkCandidates(results: WorkspaceSearchRequest[], { requestId, linkedIds }: { requestId: string; linkedIds: string[] }): LinkCandidate[] {
  const skip = new Set([requestId, ...linkedIds])
  return results.filter(result => !skip.has(result.id)).map(result => ({
    requestId: result.id,
    code: result.requestNumber ? formatRequestCode(result.requestNumber) : "",
    title: result.title,
    status: result.withoutResult ? "Closed without a result" : JOURNEY_STATUSES.find(entry => entry.status === result.status)?.label ?? result.status,
  }))
}
