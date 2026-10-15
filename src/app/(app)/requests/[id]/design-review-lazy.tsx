"use client"

import dynamic from "next/dynamic"
import { DesignReviewFallback } from "@/components/requests/design-review-fallback"

/**
 * Ask for review sits below the fold on Request detail and validates with
 * Zod, which the list and the rest of detail no longer need. Loading the panel
 * on demand keeps that library out of the shared first load (plan item 1.13).
 * Plan item 2.5: the fallback is a section of the panel's closed height (its
 * header row and hint line), so the swap below the fold does not shift.
 */
export const DesignReview = dynamic(() => import("./design-review").then(module => module.DesignReview), {
  loading: () => <DesignReviewFallback />,
})
