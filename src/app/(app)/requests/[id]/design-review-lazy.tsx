"use client"

import dynamic from "next/dynamic"
import { Skeleton } from "@/components/arc/skeleton/skeleton"

/**
 * Ask for review sits below the fold on Request detail and validates with
 * Zod, which the list and the rest of detail no longer need. Loading the panel
 * on demand keeps that library out of the shared first load (plan item 1.13).
 */
export const DesignReview = dynamic(() => import("./design-review").then(module => module.DesignReview), {
  loading: () => <Skeleton label="Loading Ask for review" lines={3} />,
})
