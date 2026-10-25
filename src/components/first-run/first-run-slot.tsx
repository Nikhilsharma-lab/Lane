import "server-only";

import type { ReactNode } from "react";
import type { MemberAuth } from "@/lib/auth-guard";
import { billingEnforced, customRoles } from "@/lib/feature-switches";
import { loadFirstRun } from "@/lib/first-run";
import { canChangeThings } from "@/lib/role-rules";
import { FirstRunGuideLoader } from "./first-run-guide-loader";
import { FirstRunReopen } from "./first-run-help";

export type FirstRunSlot = {
  /** The guide, or (once skipped or finished) the listener that lets help reopen it. */
  node: ReactNode;
  /** The first Request guide stands in for an empty workspace's welcome. */
  replacesWelcome: boolean;
};

/**
 * #217: the first run for the page being rendered (the Requests list or New Request). A first run that can't be
 * read never breaks the page: it is simply left out, and the next visit tries again.
 */
export async function firstRunSlot(member: MemberAuth, workspaceName: string, placement: "list" | "intake"): Promise<FirstRunSlot | null> {
  const run = await loadFirstRun(member).catch(() => {
    console.error("[first-run] could not be read");
    return null;
  });
  if (!run) return null;
  // Help reopens the first run on the Requests list (FIRST_RUN_HELP), so only the list listens for it.
  if (!run.view) return placement === "list" ? { node: <FirstRunReopen orgId={member.orgId} />, replacesWelcome: false } : null;
  // New Request explains filing only until the first Request is filed; the list carries the rest.
  if (placement === "intake" && (run.view.guide !== "first_request" || run.view.filed)) return null;
  const invite = member.role === "admin"
    ? { roles: customRoles() ? ["member" as const, "viewer" as const] : ["member" as const], confirmPaidSeats: billingEnforced() }
    : null;
  return {
    node: <FirstRunGuideLoader orgId={member.orgId} view={run.view} workspaceName={workspaceName} free={run.free} invite={invite}
      readsNeedsYou={canChangeThings(member.role)} placement={placement} />,
    replacesWelcome: run.view.guide === "first_request" && !run.view.filed,
  };
}
