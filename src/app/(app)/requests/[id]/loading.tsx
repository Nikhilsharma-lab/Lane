import { RequestDetailSkeleton } from "@/components/requests/detail-skeleton"

// The same wrapper as the loaded detail in requests-workspace.tsx, so the frame
// does not move when the page replaces the skeleton (plan item 2.0). Neither sets
// a background: detail sits on the pane's surface, like the strip and the list.
export default function RequestDetailLoading() {
  return <div data-slot="requests-workspace" className="flex min-h-0 flex-1 sm:h-full sm:overflow-hidden">
    <RequestDetailSkeleton />
  </div>
}
