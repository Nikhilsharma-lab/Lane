import { RequestsWorkspace } from "../../requests-workspace"

// Plan item 1.7: canonical /requests/[id]. A status or Project query on an
// older link is read in the browser as the list context to return to.
export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <RequestsWorkspace selectedRequestId={id} />
}
