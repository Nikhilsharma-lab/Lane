"use client";

import { createContext, useContext, type ReactNode } from "react";
import { WorkspaceLabelsProvider } from "@/components/requests/workspace-labels";
import { Sidebar } from "@/components/shell/sidebar";
import { RequestListViewProvider } from "@/components/requests/list-view-state";
import { StableRouterProvider } from "@/components/shell/stable-router";
import { NewRequestProvider } from "@/components/requests/new-request-provider";
import { PendingMutationsProvider } from "@/components/requests/pending-mutations-provider";
import { PickupConfirmationProvider } from "@/components/requests/pickup-confirmation";
import { MarkDoneUndoWatcher } from "@/components/requests/mark-done-undo";
import { IsItLiveProvider } from "@/components/requests/is-it-live-prompt";
import { WorkspaceProjectsProvider } from "@/components/projects/workspace-projects-provider";
import { OfflineGuard } from "@/components/shell/offline-guard";
import { PopupNotices } from "@/components/popup/lazy-popup";
import { AppMotionFeatures } from "@/components/motion/app-motion-features";
import type { PaletteRole } from "./command-palette-entries";
import type { SavedView } from "@/lib/saved-view-nav";
import type { ProjectOption } from "@/lib/request-constants";
import type { LabelCatalogue } from "@/lib/data/labels";

export type WorkspaceFrameProps = {
  orgId: string;
  userId: string;
  role: PaletteRole;
  /** #269 (A113): the account menu's Members item, named by the server's role rules; none for a Viewer or a Guest. */
  membersLabel?: string;
  workspaceName: string;
  fullName: string;
  email: string;
  needsYouCount: Promise<number>;
  savedViews: SavedView[];
  projects: ProjectOption[];
  labels: LabelCatalogue;
  /** #210: a Viewer files nothing, so no composer, no C shortcut and no palette entry open one. */
  canContribute: boolean;
  canAddReviewers: boolean;
  withoutPrediction: boolean;
  /** #271: "Page not found" draws the frame for an address no page answers (see Sidebar's `pageAddress`). */
  pageAddress?: string;
  children: ReactNode;
};

const InWorkspaceFrame = createContext(false);
/** #271: true under a WorkspaceFrame. A 404 thrown under the (app) layout renders the root not-found inside its
 * frame, so the not-found's own frame steps aside there. */
export const useInWorkspaceFrame = () => useContext(InWorkspaceFrame);

/**
 * The signed-in app frame: the sidebar and the providers every page under it shares. The (app) layout reads its
 * data and renders it around each page. #271: the root not-found renders the same frame around "Page not found"
 * for a signed-in person, through lazy-workspace-frame.tsx, so it never joins every route's first load.
 */
export function WorkspaceFrame({ orgId, userId, role, membersLabel, workspaceName, fullName, email, needsYouCount, savedViews, projects, labels, canContribute, canAddReviewers, withoutPrediction, pageAddress, children }: WorkspaceFrameProps) {
  const shell = (
    <Sidebar
      workspaceName={workspaceName}
      fullName={fullName}
      email={email}
      role={role}
      membersLabel={membersLabel}
      orgId={orgId}
      userId={userId}
      needsYouCount={needsYouCount}
      savedViews={savedViews}
      pageAddress={pageAddress}
    >
      {children}
    </Sidebar>
  );

  return (
    // #266: the signed-in app's highlights, re-flows and sheets glide and drag from the first paint.
    <InWorkspaceFrame value>
    <AppMotionFeatures>
    {/* #260: offline, the signed-in app stays on screen and says so; nothing moves or is queued.
        StableRouterProvider (#296) sits inside it so the router it hands down is the guarded one. */}
    <OfflineGuard>
    {/* #267: where a popup whose code couldn't load says so. */}
    <PopupNotices />
    <StableRouterProvider>
    <RequestListViewProvider key={`${orgId}:${userId}`}>
      {/* Pending Request changes live here, above every page, so a navigation
          while an action is pending never shows the row revert (plan item 1.5). */}
      <PendingMutationsProvider key={`${orgId}:${userId}`}>
      {/* #77: one "Pick up anyway?" confirmation for every pickup entry point. */}
      <PickupConfirmationProvider>
      {/* #103: clears the palette's Undo Mark Done when the toast queue shrinks. */}
      <MarkDoneUndoWatcher />
      {/* #135: one "Is it live?" prompt for every single-Request Mark Done. */}
      <IsItLiveProvider orgId={orgId}>
      <WorkspaceProjectsProvider key={`${orgId}:${userId}`} orgId={orgId} initialProjects={projects}>
        <WorkspaceLabelsProvider orgId={orgId} initial={labels}>
        {canContribute
          ? <NewRequestProvider context={{ orgId }} draftOwnerId={userId} canAddReviewers={canAddReviewers} withoutPrediction={withoutPrediction}>{shell}</NewRequestProvider>
          : shell}
        </WorkspaceLabelsProvider>
      </WorkspaceProjectsProvider>
      </IsItLiveProvider>
      </PickupConfirmationProvider>
      </PendingMutationsProvider>
    </RequestListViewProvider>
    </StableRouterProvider>
    </OfflineGuard>
    </AppMotionFeatures>
    </InWorkspaceFrame>
  );
}
