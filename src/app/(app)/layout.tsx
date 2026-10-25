import { auth } from "@clerk/nextjs/server";
import { WorkspaceLabelsProvider } from "@/components/requests/workspace-labels";
import { redirect } from "next/navigation";
import { getMember, getWorkspace } from "@/lib/ensure-workspace";
import { loadProjects } from "@/lib/data/projects";
import { loadLabels } from "@/lib/data/labels";
import { countNeedsYou } from "@/lib/data/inbox";
import { Sidebar } from "@/components/shell/sidebar";
import { RequestListViewProvider } from "@/components/requests/list-view-state";
import { NewRequestProvider } from "@/components/requests/new-request-provider";
import { PendingMutationsProvider } from "@/components/requests/pending-mutations-provider";
import { PickupConfirmationProvider } from "@/components/requests/pickup-confirmation";
import { MarkDoneUndoWatcher } from "@/components/requests/mark-done-undo";
import { IsItLiveProvider } from "@/components/requests/is-it-live-prompt";
import { WorkspaceProjectsProvider } from "@/components/projects/workspace-projects-provider";
import { canChangeThings, canContribute } from "@/lib/role-rules";
import { followSeatChangesAfterResponse } from "@/lib/billing";

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
  if (!member) return (await auth()).redirectToSignIn();

  // The bell's count (#205: Needs-you items, worked out from Request state;
  // nothing is written) is not awaited here. It streams to the Suspense-wrapped
  // bell, so it never holds up the first byte. A failed count leaves the badge
  // empty, as a failed client fetch did before; it never breaks the shell.
  const needsYouCount = countNeedsYou(member).catch(() => 0);
  const [result, projects, labels] = await Promise.all([getWorkspace(), loadProjects(member), loadLabels(member)]);
  if (!result) return (await auth()).redirectToSignIn();
  if (result.needsOnboarding) redirect("/onboarding");
  // #215: a paying workspace's seats follow Clerk memberships; checked after the response, at most every 10 minutes.
  followSeatChangesAfterResponse({ orgId: result.orgId });

  const shell = (
    <Sidebar
      workspaceName={result.workspaceName}
      fullName={result.fullName}
      email={result.email}
      role={result.role}
      orgId={result.orgId}
      userId={result.userId}
      needsYouCount={needsYouCount}
    >
      {children}
    </Sidebar>
  );

  return (
    <RequestListViewProvider key={`${result.orgId}:${result.userId}`}>
      {/* Pending Request changes live here, above every page, so a navigation
          while an action is pending never shows the row revert (plan item 1.5). */}
      <PendingMutationsProvider key={`${result.orgId}:${result.userId}`}>
      {/* #77: one "Pick up anyway?" confirmation for every pickup entry point. */}
      <PickupConfirmationProvider>
      {/* #103: clears the palette's Undo Mark Done when the toast queue shrinks. */}
      <MarkDoneUndoWatcher />
      {/* #135: one "Is it live?" prompt for every single-Request Mark Done. */}
      <IsItLiveProvider orgId={result.orgId}>
      <WorkspaceProjectsProvider key={`${result.orgId}:${result.userId}`} orgId={result.orgId} initialProjects={projects}>
        <WorkspaceLabelsProvider orgId={result.orgId} initial={labels}>
        {/* #210: a Viewer files nothing, so no composer, no C shortcut and no palette entry open one. */}
        {canContribute(member.role)
          ? <NewRequestProvider context={{ orgId: result.orgId }} draftOwnerId={result.userId} canAddReviewers={canChangeThings(member.role)} withoutPrediction={member.role === "guest"}>{shell}</NewRequestProvider>
          : shell}
        </WorkspaceLabelsProvider>
      </WorkspaceProjectsProvider>
      </IsItLiveProvider>
      </PickupConfirmationProvider>
      </PendingMutationsProvider>
    </RequestListViewProvider>
  );
}
