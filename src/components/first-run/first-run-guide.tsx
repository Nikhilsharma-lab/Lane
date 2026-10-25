"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { updateFirstRun } from "@/app/(app)/first-run-actions";
import { inviteToWorkspace } from "@/app/(app)/settings/members/actions";
import { useListAnnouncer } from "@/components/requests/list-announcer";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { callAction } from "@/lib/action-call";
import type { WorkspaceFreeRequests } from "@/lib/billing";
import { FIRST_REQUEST_STEPS, type FirstRequestStep, type FirstRunChange, type FirstRunView } from "@/lib/first-run-rules";
import { FIRST_RUN_HELP } from "@/lib/first-run-help-link";
import { FirstRunGuideView } from "./first-run-guide-view";
import type { FirstRunInviteRole } from "./first-run-invite-form";
import { clearHelpHash, consumeFocusRequest, useFirstRunHelp } from "./first-run-help";

/** Loaded when an Admin reaches the Reviewers step, so the form adds nothing to the page's first load. */
const FirstRunInviteForm = dynamic(() => import("./first-run-invite-form").then(module => module.FirstRunInviteForm));

const FAILED = "Couldn’t save your first run. Try again.";

export type FirstRunGuideProps = {
  orgId: string;
  view: FirstRunView;
  workspaceName: string;
  free: WorkspaceFreeRequests | null;
  /** The roles an Admin can invite as from the first run; null for anyone else. */
  invite: { roles: FirstRunInviteRole[]; confirmPaidSeats: boolean } | null;
  readsNeedsYou: boolean;
  placement: "list" | "intake";
};

/**
 * #217: the first run's adapter. It keeps the step on screen, saves each step read (so a reload resumes there),
 * and saves skip and finish, after which the page renders without it and the shell's polite region says where to
 * find it again. Help's "First-run guide" link brings focus back to it.
 */
export function FirstRunGuide({ orgId, view, workspaceName, free, invite, readsNeedsYou, placement }: FirstRunGuideProps) {
  const [step, setStep] = useState<FirstRequestStep>(view.guide === "first_request" ? view.step : "framing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const announce = useListAnnouncer();
  const { toast } = useToastStack();
  const root = useRef<HTMLDivElement>(null);

  const focusGuide = useCallback(() => {
    const heading = root.current?.querySelector<HTMLElement>("#first-run-heading");
    heading?.scrollIntoView({ block: "nearest" });
    heading?.focus({ preventScroll: true });
  }, []);
  useEffect(() => { if (consumeFocusRequest()) focusGuide(); }, [focusGuide]);
  useFirstRunHelp(useCallback(() => { clearHelpHash(); focusGuide(); }, [focusGuide]));

  /** Saves one change; the error, if any, comes back for the caller to show. */
  const save = useCallback(async (change: FirstRunChange): Promise<string | null> => {
    try {
      const answer = await callAction(() => updateFirstRun(change, { orgId }));
      return "error" in answer ? answer.error : null;
    } catch {
      return FAILED;
    }
  }, [orgId]);
  /** Work saved in the background (a step read) reports a failure as a toast; the guide carries on. */
  const inBackground = (saving: Promise<string | null>) => { void saving.then(failed => { if (failed) toast({ type: "error", title: failed }); }); };

  const close = async (change: "skip" | "finish") => {
    setBusy(true);
    setError(null);
    const failed = await save({ change });
    setBusy(false);
    if (failed) { setError(failed); return; }
    announce(`${change === "skip" ? "First-run guide skipped" : "First-run guide finished"}. Find it again under ${FIRST_RUN_HELP.label} in your account menu.`);
    document.getElementById("lane-main")?.focus({ preventScroll: true });
  };

  const move = (to: FirstRequestStep) => {
    // Moving on means this step was read; going back saves nothing.
    if (FIRST_REQUEST_STEPS.indexOf(to) > FIRST_REQUEST_STEPS.indexOf(step)) inBackground(save({ change: "step", step }));
    setStep(to);
    // The new step's heading is the next thing to read; focus stays on the control that moved.
    announce(`Step ${FIRST_REQUEST_STEPS.indexOf(to) + 1} of ${FIRST_REQUEST_STEPS.length}`);
  };

  const inviteForm = invite && step === "reviewers"
    ? <FirstRunInviteForm roles={invite.roles} confirmPaidSeats={invite.confirmPaidSeats}
        onInvite={(email, role, confirmedPaidSeat) => callAction(() => inviteToWorkspace({ email, role, confirmedPaidSeat }, { orgId }))} />
    : undefined;

  return <div ref={root} id="first-run">
    <FirstRunGuideView view={view} step={step} workspaceName={workspaceName} free={free} inviteForm={inviteForm} readsNeedsYou={readsNeedsYou}
      placement={placement} busy={busy} error={error} onStep={move}
      onSkip={() => { void close("skip"); }} onFinish={() => { void close("finish"); }}
      // Opening the Inbox is the joined guide's one step, so it finishes the guide on the way there.
      onOpenInbox={() => inBackground(save({ change: "step", step: "inbox" }).then(failed => failed ?? save({ change: "finish" })))}
      onFile={() => { if (view.guide === "first_request") inBackground(save({ change: "step", step })); }} />
  </div>;
}
