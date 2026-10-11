import { RequestDetailSkeleton } from "@/components/requests/detail-view"

// The same wrapper as the loaded detail in requests-workspace.tsx, so the
// background does not flash when the page replaces the skeleton (plan item 2.0).
export default function RequestDetailLoading() {
  return <div data-slot="requests-workspace" className="flex min-h-0 flex-1 bg-background sm:h-full sm:overflow-hidden">
    <RequestDetailSkeleton />
  </div>
}
