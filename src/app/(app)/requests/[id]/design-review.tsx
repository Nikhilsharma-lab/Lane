"use client"

import { RequestDesignLink } from "@/components/requests/request-design-link"
import type { RequestReviewState } from "@/lib/request-review"

/** Compatibility for older callers: design reviews now stay in Figma. */
export function DesignReview({ initialState }: {
  requestId: string; initialState: RequestReviewState; currentUserId: string;
  canRequest: boolean; canManage: boolean; context: { orgId: string };
}) {
  return <RequestDesignLink reviews={initialState.reviews} />
}
