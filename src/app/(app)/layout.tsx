import { redirect } from "next/navigation";
import { getMember, getWorkspace } from "@/lib/ensure-workspace";
import { loadProjects } from "@/lib/data/projects";
import { loadUnreadCount } from "@/lib/data/notifications";
import { Sidebar } from "@/components/shell/sidebar";
import { RequestListViewProvider } from "@/components/requests/list-view-state";
import { NewRequestProvider } from "@/components/requests/new-request-provider";
import { WorkspaceProjectsProvider } from "@/components/projects/workspace-projects-provider";

// The AI gate in the New Request composer waits up to 15 s (src/lib/ai/triage.ts),
// and the composer opens from every page under this layout, so the function
// limit for the whole segment sits above it (plan item 1.1).
export const maxDuration = 30;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Identity and permission come from Clerk claims, so the reads below can
  // start before any database round trip (plan item 1.8).
  const member = await getMember();
  if (!member) redirect("/login");

  // The unread count is not awaited here. It streams to the Suspense-wrapped
  // bell, so it never holds up the first byte. A failed count leaves the badge
  // empty, as a failed client fetch did before; it never breaks the shell.
  const unreadCount = loadUnreadCount(member).catch(() => 0);
  const [result, projects] = await Promise.all([getWorkspace(), loadProjects(member)]);
  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

  return (
    <RequestListViewProvider key={`${result.orgId}:${result.userId}`}>
      <WorkspaceProjectsProvider key={`${result.orgId}:${result.userId}`} orgId={result.orgId} initialProjects={projects}>
        <NewRequestProvider context={{ orgId: result.orgId }} draftOwnerId={result.userId}>
          <Sidebar
            workspaceName={result.workspaceName}
            fullName={result.fullName}
            email={result.email}
            role={result.role}
            orgId={result.orgId}
            unreadCount={unreadCount}
          >
            {children}
          </Sidebar>
        </NewRequestProvider>
      </WorkspaceProjectsProvider>
    </RequestListViewProvider>
  );
}
