import { NewRequestProvider } from "@/components/requests/new-request-provider"
import { ToastStackProvider, ToastStack } from "@/components/arc/toast-stack/toast-stack"
import { useEffect, useState, type ComponentProps } from "react"
import type { OverviewRequest } from "@/lib/request-overview"
import { REQUEST_TYPES } from "@/lib/request-properties"
import { RequestsShellFixture } from "../requests.stories"

// Explicit illustrative saved numbers. A fixture Request without one is a
// fixture mistake, not a Request without a code.
const illustrativeNumbers: Record<string, number> = {
  "fixture-1": 1, "fixture-2": 2, "fixture-3": 3, "fixture-4": 4,
  "fixture-5": 5, "fixture-6": 6, "fixture-7": 7, "fixture-8": 8,
  "fixture-9": 9, "fixture-10": 10, "fixture-11": 11, "fixture-12": 12,
}

// Re-render the production list as a server-action revalidation would. No test
// controls or server-response branches are added to the product component.
let revalidate: ((id: string, change: Partial<OverviewRequest>) => void) | undefined

/** Saves a change into the preview's rows and re-renders the production list,
 * the way revalidation does after a server action saved it. Call it from a
 * mocked action in a story. */
export function revalidateLinearPreview(id: string, change: Partial<OverviewRequest>) {
  if (!revalidate) throw new Error("LinearRequestsFixture is not mounted")
  revalidate(id, change)
}

/** The production Requests list in the Linear shell over illustrative data.
 * Row codes, priorities and menus come from the shipped RequestRowActions and
 * Storybook's mocked server actions; nothing here is written anywhere. */
export function LinearRequestsFixture(args: ComponentProps<typeof RequestsShellFixture>) {
  const [changes, setChanges] = useState<Record<string, Partial<OverviewRequest>>>({})
  useEffect(() => {
    revalidate = (id, change) => setChanges(previous => ({ ...previous, [id]: { ...previous[id], ...change } }))
    return () => { revalidate = undefined }
  }, [])
  const requests = args.requests.map((request, index) => {
    const number = request.requestNumber ?? illustrativeNumbers[request.id]
    if (number === undefined) throw new Error(`Provide an explicit illustrative Request number for ${request.id}`)
    return { ...request, requestNumber: number, requestType: request.requestType ?? REQUEST_TYPES[index % REQUEST_TYPES.length], ...changes[request.id] }
  })
  return <ToastStackProvider><NewRequestProvider context={args.context ?? { orgId: "org_storybook" }} draftOwnerId="linear-preview-person">
    <RequestsShellFixture {...args} requests={requests} linearPreviewAutoCollapse />
  <ToastStack /></NewRequestProvider></ToastStackProvider>
}
