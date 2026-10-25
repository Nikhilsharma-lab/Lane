"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/arc/skeleton/skeleton";

/**
 * #217: the first run shows for a person's first visits only, so its code loads after the Requests list and New
 * Request instead of in their first load, as Settings → Members' controls do (#210). The server still renders it.
 */
export const FirstRunGuideLoader = dynamic(() => import("./first-run-guide").then(module => module.FirstRunGuide), {
  loading: () => <Skeleton label="Loading the first-run guide…" lines={4} />,
});
