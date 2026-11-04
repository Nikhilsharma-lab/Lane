import type { Metadata } from "next";
import { LazyMissingInFrame } from "@/components/shell/lazy-missing-in-frame";

export const metadata: Metadata = { title: "Page not found" };

// #271 (A117), fix round 3: a 404 thrown under the (app) layout, an unknown Request (requests/[id]/layout.tsx) or a
// missing Metric, renders here, inside that layout's frame, so it reads nothing of its own: Next draws it with every
// page under (app), shown or not. The screen's code loads only when it is shown (lazy-missing-in-frame.tsx).
export default function AppNotFound() {
  return <LazyMissingInFrame />;
}
