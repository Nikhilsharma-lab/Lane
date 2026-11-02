import { redirect } from "next/navigation"
import { getMember, getWorkspace } from "@/lib/ensure-workspace"
import { loadRequestList } from "@/lib/data/requests"
import { loadSavedViews } from "@/lib/data/saved-views"
import { firstRunSlot } from "@/components/first-run/first-run-slot"
import { RequestsOverview } from "./requests-overview"
import { timePage, timed } from "@/lib/request-timings"

/**
 * The Requests list at "/". Request pages render request-detail-workspace.tsx:
 * kept apart so neither route's first load carries the other's client code
 * (plan item 2.12); the list's preview loads the detail islands on demand.
 */
export async function RequestsWorkspace() {
  void timePage("Requests list")
  const member = await getMember()
  if (!member) redirect("/login")

  // Plan item 1.8: the list read starts from Clerk claims and runs in parallel
  // with the profile/workspace join, so the page waits for one round trip.
  // Plan items 1.7 and 1.10: the server no longer reads the status view or the
  // Project filter. The list loads every active Request (capped) plus the
  // latest Done, and the browser filters it. The loader keeps the workspace
  // and guest guards (src/lib/data/requests.ts).
  // #217: the first run is read after getWorkspace, which records a workspace Lane hasn't seen before, and
  // alongside the list.
  // #219: the person's own saved views (the layout's read, shared within this render).
  const [[workspace, firstRun], list, savedViews] = await Promise.all([
    getWorkspace().then(async ws => [ws, ws && !ws.needsOnboarding ? await timed("data", () => firstRunSlot(member, ws.workspaceName, "list")) : null] as const),
    timed("data", () => loadRequestList(member)),
    timed("data", () => loadSavedViews(member)).catch(() => []),
  ])
  if (!workspace) redirect("/login")
  if (workspace.needsOnboarding) redirect("/onboarding")

  // Plan item 2.1: an empty workspace renders the same list, whose records
  // region shows the welcome, so the first Request lands in place.
  return <RequestsOverview
    requests={list.rows.map(request => ({ ...request, createdAt: request.createdAt.toISOString() }))}
    activeCapped={list.activeCapped}
    hasOlderFinished={list.hasOlderFinished}
    isGuest={member.role === "guest"}
    readOnly={member.role === "viewer"}
    // The welcome is about the workspace, never about the current filter.
    canInvite={member.role === "admin"}
    context={{ orgId: member.orgId }}
    viewer={{ id: member.userId, name: workspace.fullName, isAdmin: member.role === "admin", readOnly: member.role === "viewer" }}
    firstRun={firstRun ?? undefined}
    savedViews={savedViews}
  />
}
