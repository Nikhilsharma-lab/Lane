"use server"

import type { ReviewActionResult } from "@/lib/request-review"

// Keep old action entry points harmless for tabs opened before reviews moved to Figma.
// Saved review data is retained; no new review, response or notification is written.
type RetiredActionArgs = [requestId: string, input: unknown, context: { orgId: string }]
const RETIRED = "Design reviews happen in Figma. Open the design link to continue."

export async function requestDesignReview(...args: RetiredActionArgs): Promise<ReviewActionResult> {
  void args
  return { error: RETIRED }
}

export async function respondToDesignReview(...args: RetiredActionArgs): Promise<ReviewActionResult> {
  void args
  return { error: RETIRED }
}

export async function withdrawDesignReview(...args: RetiredActionArgs): Promise<ReviewActionResult> {
  void args
  return { error: RETIRED }
}
