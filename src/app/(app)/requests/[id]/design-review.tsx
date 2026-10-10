"use client"

import { useCallback } from "react"
import { DesignReviewPanel } from "@/components/requests/design-review-panel"
import { useServerRefresh } from "@/components/requests/use-optimistic-action"
import type { RequestReviewState, ReviewActionResult, ReviewPerson } from "@/lib/request-review"
import { requestDesignReview, respondToDesignReview, withdrawDesignReview } from "./review-actions"

type ReviewerList = { members: ReviewPerson[] } | { error: string }
const loadFailed: ReviewerList = { error: "Team members could not be loaded. Try again." }

export function DesignReview({ requestId, initialState, currentUserId, canRequest, canManage, context }: {
  requestId: string; initialState: RequestReviewState; currentUserId: string;
  canRequest: boolean; canManage: boolean; context: { orgId: string };
}) {
  const serverRefresh = useServerRefresh()
  // Plan item 1.16: the type-ahead reads GET /api/reviewers, so it never queues
  // behind a pending mutation and a stale query is aborted by the panel.
  const findReviewers = useCallback(async (query: string, signal?: AbortSignal): Promise<ReviewerList> => {
    const params = new URLSearchParams({ org: context.orgId, request: requestId, q: query })
    const response = await fetch(`/api/reviewers?${params}`, { signal, headers: { accept: "application/json" }, credentials: "same-origin" })
    const body = await response.json().catch(() => null) as ReviewerList | null
    if (body && typeof body === "object" && ("members" in body || "error" in body)) return body
    return loadFailed
  }, [context.orgId, requestId])
  async function refresh(result: Promise<ReviewActionResult>) {
    const response = await result
    // A router refresh preserves this panel's drafts while reconciling a newer
    // saved version after a conflict. A saved review already revalidated the
    // detail path, so its response carries the refreshed content.
    if ("error" in response) serverRefresh()
    return response
  }
  return <DesignReviewPanel key={requestId} initialState={initialState} currentUserId={currentUserId} canRequest={canRequest} canManage={canManage}
    onFindReviewers={findReviewers}
    onRequest={input => refresh(requestDesignReview(requestId, input, context))}
    onRespond={input => refresh(respondToDesignReview(requestId, input, context))}
    onWithdraw={input => refresh(withdrawDesignReview(requestId, input, context))}
  />
}
