import type { ReactNode } from "react"
import { WorkspaceProjectsProvider } from "@/components/projects/workspace-projects-provider"
import { RequestListViewProvider } from "@/components/requests/list-view-state"
import { PickupConfirmationProvider } from "@/components/requests/pickup-confirmation"
import { StableRouterProvider } from "@/components/shell/stable-router"

/** The providers the (app) layout always supplies, for tests that render part of the app on its own. */
export function AppProviders({ children, orgId = "org_test" }: { children?: ReactNode; orgId?: string }) {
  return <StableRouterProvider><RequestListViewProvider>
    <PickupConfirmationProvider>
      <WorkspaceProjectsProvider orgId={orgId} initialProjects={[]}>{children}</WorkspaceProjectsProvider>
    </PickupConfirmationProvider>
  </RequestListViewProvider></StableRouterProvider>
}
