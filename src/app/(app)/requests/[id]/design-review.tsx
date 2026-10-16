"use client"

import { useCallback } from "react"
import { DesignReviewPanel } from "@/components/requests/design-review-panel"
import { useOptionalDetailRequest } from "@/components/requests/detail-context"
import { useOptimisticAction, useServerRefresh } from "@/components/requests/use-optimistic-action"
import type { RequestReviewState, ReviewActionResult, ReviewPerson } from "@/lib/request-review"
import { requestDesignReview, respondToDesignReview, withdrawDesignReview } from "./review-actions"

type ReviewerList = { members: ReviewPerson[] } | { error: string }
const loadFailed: ReviewerList = { error: "Teammates could not be loaded. Try again." }
// review-actions.ts's stale-version conflict: the one failure whose fix is a newer snapshot.
const STALE = /changed while you were working/i
const SAVE_FAILED = "Lane could not save this review. Your input is still here. Try again."

export function DesignReview({ requestId, initialState, currentUserId, canRequest, canManage, context }: {
  requestId: string; initialState: RequestReviewState; currentUserId: string;
  canRequest: boolean; canManage: boolean; context: { orgId: string };
}) {
  const optimistic = useOptimisticAction()
  const serverRefresh = useServerRefresh()
  const detail = useOptionalDetailRequest()
  // Plan item 2.5: an open review form hides the strip's filled action, so the page keeps one primary.
  const reportForm = detail?.reportForm
  const viewer = detail?.viewer ?? { id: currentUserId, name: "You" }
  // Plan item 1.16: the type-ahead reads GET /api/reviewers, so it never queues
  // behind a pending mutation and a stale query is aborted by the panel.
  const findReviewers = useCallback(async (query: string, signal?: AbortSignal): Promise<ReviewerList> => {
    const params = new URLSearchParams({ org: context.orgId, request: requestId, q: query })
    const response = await fetch(`/api/reviewers?${params}`, { signal, headers: { accept: "application/json" }, credentials: "same-origin" })
    const body = await response.json().catch(() => null) as ReviewerList | null
    if (body && typeof body === "object" && ("members" in body || "error" in body)) return body
    return loadFailed
  }, [context.orgId, requestId])
  // Plan item 2.6: the panel shows the save in the same tick and rolls back on
  // failure; this runner adds the one silent auth retry and tracks the save
  // under the Request, with no row patch and no toast (the panel's inline Alert
  // is the feedback). Success never refreshes the router: the action already
  // revalidated. Only the stale-version conflict re-syncs, since a newer
  // snapshot is its fix; a rule refusal or a lost connection refreshes nothing.
  const run = useCallback((action: () => Promise<ReviewActionResult>): Promise<ReviewActionResult> =>
    optimistic({ id: requestId, run: action, onError: () => {}, refreshOnError: false }).then(outcome => {
      if (outcome.status === "success") return outcome.value
      if (outcome.status === "error" && STALE.test(outcome.error)) serverRefresh()
      return { error: outcome.status === "error" ? outcome.error : SAVE_FAILED }
    }), [optimistic, requestId, serverRefresh])
  return <DesignReviewPanel key={requestId} id="ask-for-review" onFormOpenChange={reportForm} initialState={initialState} currentUserId={currentUserId} viewer={viewer} canRequest={canRequest} canManage={canManage}
    onFindReviewers={findReviewers}
    onRequest={input => run(() => requestDesignReview(requestId, input, context))}
    onRespond={input => run(() => respondToDesignReview(requestId, input, context))}
    onWithdraw={input => run(() => withdrawDesignReview(requestId, input, context))}
  />
}
