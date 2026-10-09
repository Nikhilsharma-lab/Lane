import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { Sidebar } from "@/components/shell/sidebar";
import { RequestListViewProvider } from "@/components/requests/list-view-state";
import { NewRequestProvider } from "@/components/requests/new-request-provider";
import { WorkspaceProjectsProvider } from "@/components/projects/workspace-projects-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getWorkspace();
  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

  return (
    <RequestListViewProvider key={`${result.orgId}:${result.userId}`}>
      <WorkspaceProjectsProvider key={`${result.orgId}:${result.userId}`} orgId={result.orgId}>
        <NewRequestProvider context={{ orgId: result.orgId }} draftOwnerId={result.userId}>
          <Sidebar
            workspaceName={result.workspaceName}
            fullName={result.fullName}
            email={result.email}
            role={result.role}
            orgId={result.orgId}
          >
            {children}
          </Sidebar>
        </NewRequestProvider>
      </WorkspaceProjectsProvider>
    </RequestListViewProvider>
  );
}
