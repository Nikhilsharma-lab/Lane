"use client";

import dynamic from "next/dynamic";
import { Placeholder } from "@/components/loading/placeholder";

/**
 * #217: the first run shows for a person's first visits only, so its code loads after the Requests list and New
 * Request instead of in their first load, as Settings → Members' controls do (#210). The server still renders it.
 */
export const FirstRunGuideLoader = dynamic(() => import("./first-run-guide").then(module => module.FirstRunGuide), {
  loading: () => <Placeholder label="Loading the first-run guide…" lines={4} />,
});
