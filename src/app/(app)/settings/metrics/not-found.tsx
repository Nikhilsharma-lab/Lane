import type { Metadata } from "next";
import { LazyMissingInFrame } from "@/components/shell/lazy-missing-in-frame";

export const metadata: Metadata = { title: "Page not found" };

// #271 (A117), fix round 3: a Metric that isn't this workspace's (metrics/[id]/layout.tsx and page.tsx answer it with
// a 404) renders "Page not found" here, inside the (app) layout's frame, so it reads nothing of its own: Next draws a
// not-found with every page under it, shown or not. Its code loads only when it is shown (lazy-missing-in-frame.tsx).
export default function MetricNotFound() {
  return <LazyMissingInFrame />;
}
