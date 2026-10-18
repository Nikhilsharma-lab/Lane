"use client"

import dynamic from "next/dynamic"

/** Older callers load only the saved design link, never review controls. */
export const DesignReview = dynamic(() => import("./design-review").then(module => module.DesignReview))
