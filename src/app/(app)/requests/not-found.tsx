import { LazyMissingInFrame } from "@/components/shell/lazy-missing-in-frame";

// #271 (A117), fix round 3: an unknown Request (requests/[id]/layout.tsx answers it with a 404) renders "This Request
// can't be opened" here, inside the (app) layout's frame, so it reads nothing of its own: Next draws a not-found with
// every page under it, shown or not. Its code loads only when it is shown (lazy-missing-in-frame.tsx).
export default function RequestNotFound() {
  return <LazyMissingInFrame />;
}
