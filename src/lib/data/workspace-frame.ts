import "server-only";

import { cache } from "react";

import type { MemberAuth } from "@/lib/auth-guard";
import { getWorkspace } from "@/lib/ensure-workspace";
import { loadProjects } from "@/lib/data/projects";
import { loadLabels } from "@/lib/data/labels";
import { loadSavedViews } from "@/lib/data/saved-views";
import { countNeedsYou } from "@/lib/data/inbox";
import { canChangeThings, canContribute, membersItemLabel } from "@/lib/role-rules";
import { timed } from "@/lib/request-timings";
import type { WorkspaceFrameProps } from "@/components/shell/workspace-frame";

/**
 * The signed-in frame's reads (the (app) layout's, and since #271 the root not-found's for a signed-in person).
 * Null when the session has no workspace; `needsOnboarding` when the person has not finished onboarding.
 *
 * Once per request (fix round 3): Next renders the root not-found with every page, shown or not, so without this
 * every page read its frame twice, sent it twice, and with the database refusing connections the second set of reads
 * kept the root error screen's tab loading for up to two minutes. Both callers pass getMember()'s cached member.
 */
export const loadWorkspaceFrame = cache(async function loadWorkspaceFrame(member: MemberAuth): Promise<
  | { needsOnboarding: true }
  | { needsOnboarding: false; orgId: string; frame: Omit<WorkspaceFrameProps, "children" | "pageAddress"> }
  | null
> {
  // The bell's count (#205: Needs-you items, worked out from Request state;
  // nothing is written) is not awaited here. It streams to the Suspense-wrapped
  // bell, so it never holds up the first byte. A failed count leaves the badge
  // empty, as a failed client fetch did before; it never breaks the shell.
  const needsYouCount = timed("shell", () => countNeedsYou(member)).catch(() => 0);
  // #219: the person's own saved views for the navigation. A failed read leaves the group out; it never breaks the shell.
  // #265: the frame's own reads are the `shell` step of the server timings.
  const [result, projects, labels, savedViews] = await Promise.all([getWorkspace(), timed("shell", () => loadProjects(member)), timed("shell", () => loadLabels(member)), timed("shell", () => loadSavedViews(member)).catch(() => [])]);
  if (!result) return null;
  if (result.needsOnboarding) return { needsOnboarding: true };
  return {
    needsOnboarding: false,
    orgId: result.orgId,
    frame: {
      orgId: result.orgId,
      userId: result.userId,
      role: result.role,
      membersLabel: membersItemLabel(member.role),
      workspaceName: result.workspaceName,
      fullName: result.fullName,
      email: result.email,
      needsYouCount,
      savedViews,
      projects,
      labels,
      canContribute: canContribute(member.role),
      canAddReviewers: canChangeThings(member.role),
      withoutPrediction: member.role === "guest",
    },
  };
});
