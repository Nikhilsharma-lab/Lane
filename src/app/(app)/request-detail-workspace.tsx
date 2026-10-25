import { redirect } from "next/navigation"
import { getMember, getWorkspace } from "@/lib/ensure-workspace"
import { loadRequestDetail } from "@/lib/data/requests"
import { requestListHref } from "@/lib/request-workspace"
import { ListAnnouncerProvider } from "@/components/requests/list-announcer"
import { RequestUnavailable } from "@/components/requests/detail-view"
import { RequestDetailPane } from "@/components/requests/request-detail-pane"
import { RequestWorkspaceKeyboard } from "@/components/requests/request-workspace-keyboard"

/**
 * Canonical /requests/[id] (plan items 1.7 and 2.5). Its own module, apart
 * from the list's (requests-workspace.tsx): a server module registers a client
 * reference for every client module it imports, so sharing one module put the
 * detail islands in the list's first load and the list in the page's (plan
 * item 2.12). The list reaches these islands on demand, through its preview.
 */
export async function RequestDetailWorkspace({ selectedRequestId }: { selectedRequestId: string }) {
  const member = await getMember()
  if (!member) redirect("/login")

  // Plan items 1.8 and 1.10: the detail read starts from Clerk claims and runs
  // in parallel with the profile/workspace join, so the page waits for one
  // round trip. It loads only that Request, its comments and its files, with
  // the workspace and guest guards (src/lib/data/requests.ts).
  const [workspace, selected] = await Promise.all([
    getWorkspace(),
    loadRequestDetail(member, selectedRequestId),
  ])
  if (!workspace) redirect("/login")
  if (workspace.needsOnboarding) redirect("/onboarding")

  // The list context lives in the layout's list view state, so returning to
  // "/" restores the status view and Project filter.
  const returnHref = requestListHref("all")

  return (
    <div
      data-slot="requests-workspace"
      className="flex min-h-0 flex-1 sm:h-full sm:overflow-hidden"
    >
      <RequestWorkspaceKeyboard
        selectedRequestId={selectedRequestId}
        returnHref={returnHref}
      />
      {selected ? (
        // Plan item 2.5: keyed by Request, so previous and next mount a fresh
        // detail (scrolled to the top, no comment draft carried across). Copy,
        // pick up and priority speak in one polite region, as on the list.
        <ListAnnouncerProvider key={selected.request.id}>
          <RequestDetailPane
            request={selected.request}
            comments={selected.comments}
            attachments={selected.attachments}
            returnHref={returnHref}
            orgId={member.orgId}
            currentUserId={member.userId}
            viewerName={workspace.fullName}
            isAdmin={member.role === "admin"}
            isGuest={member.role === "guest"}
            readOnly={member.role === "viewer"}
          />
        </ListAnnouncerProvider>
      ) : <RequestUnavailable returnHref={returnHref} />}
    </div>
  )
}
