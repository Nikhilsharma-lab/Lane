"use client"

import { useRouter } from "next/navigation"
import { DesignReviewPanel } from "@/components/requests/design-review-panel"
import type { RequestReviewState, ReviewActionResult } from "@/lib/request-review"
import { listDesignReviewers, requestDesignReview, respondToDesignReview, withdrawDesignReview } from "./review-actions"

export function DesignReview({ requestId, initialState, currentUserId, canRequest, canManage, context }: {
  requestId: string; initialState: RequestReviewState; currentUserId: string;
  canRequest: boolean; canManage: boolean; context: { orgId: string };
}) {
  const router = useRouter()
  async function refresh(result: Promise<ReviewActionResult>) {
    const response = await result
    // A router refresh preserves this panel's drafts while reconciling a newer
    // saved version after a conflict. A saved review already revalidated the
    // detail path, so its response carries the refreshed content.
    if ("error" in response) router.refresh()
    return response
  }
  return <DesignReviewPanel key={requestId} initialState={initialState} currentUserId={currentUserId} canRequest={canRequest} canManage={canManage}
    onFindReviewers={query => listDesignReviewers(requestId, query, context)}
    onRequest={input => refresh(requestDesignReview(requestId, input, context))}
    onRespond={input => refresh(respondToDesignReview(requestId, input, context))}
    onWithdraw={input => refresh(withdrawDesignReview(requestId, input, context))}
  />
}
