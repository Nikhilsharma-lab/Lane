import type { Metadata } from "next"
import { getMember } from "@/lib/ensure-workspace"
import { readRequestPage } from "@/lib/data/request-page"
import { RequestDetailWorkspace } from "../../request-detail-workspace"

// #271 (A114): a Request's tab reads its typed title ("Checkout button misaligned · Lane"). The read is the page's
// own, shared through readRequestPage, so the title costs no second round trip.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const [{ id }, member] = await Promise.all([params, getMember()])
  const selected = member ? await readRequestPage(member, id) : null
  return { title: selected?.request.title ?? "Request unavailable" }
}

// Plan item 1.7: canonical /requests/[id]. A status or Project query on an
// older link is read in the browser as the list context to return to.
export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RequestDetailWorkspace selectedRequestId={id} />
}
