import type { Metadata } from "next"
import { requestAtAddress } from "./request-at-address"
import { RequestDetailWorkspace } from "../../request-detail-workspace"

// #271 (A114): a Request's tab reads its typed title ("Checkout button misaligned · Lane").
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { selected } = await requestAtAddress(params)
  return { title: selected?.request.title ?? "Request unavailable" }
}

// Plan item 1.7: canonical /requests/[id]. A status or Project query on an
// older link is read in the browser as the list context to return to.
export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RequestDetailWorkspace selectedRequestId={id} />
}
