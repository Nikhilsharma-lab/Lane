"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Progress } from "@/components/arc/progress/progress";
import buttonStyles from "@/components/arc/button/button.module.css";
import { NewRequestLink } from "@/components/requests/new-request-link";
import type { WorkspaceFreeRequests } from "@/lib/billing";
import { FIRST_REQUEST_STEPS, freeRequestsNote, type FirstRequestStep, type FirstRunView } from "@/lib/first-run-rules";
import { FREE_REQUESTS } from "@/lib/free-request-rules";
import styles from "./first-run.module.css";

export const STEP_TITLES: Record<FirstRequestStep, string> = {
  framing: "Start with the problem",
  prediction: "Set the goal",
  reviewers: "Ask Reviewers",
  free_requests: "Free Requests",
  release: "Release and Result due",
};

const COMING_BACK = "On the day the result is due, Lane brings you back: the Request is in your Inbox under Needs you, ready for the actual result.";

export type FirstRunGuideViewProps = {
  view: FirstRunView;
  /** The step on screen (the adapter moves it; the stored progress says where it resumes). */
  step: FirstRequestStep;
  workspaceName: string;
  free: WorkspaceFreeRequests | null;
  /** The invite form, for an Admin only. */
  inviteForm?: ReactNode;
  /** Admins and Members get Needs-you items; Guests and Viewers only updates. */
  readsNeedsYou: boolean;
  /** On New Request the page's own button files the Request, so the guide offers none. */
  placement: "list" | "intake";
  busy?: boolean;
  /** Why skipping or finishing didn't save. */
  error?: string | null;
  /** After the first Request is filed, the steps are shown again only on request. */
  showSteps?: boolean;
  onStep: (step: FirstRequestStep) => void;
  onShowSteps?: () => void;
  onSkip: () => void;
  onFinish: () => void;
  onOpenInbox: () => void;
  onFile: () => void;
};

function StepBody({ step, free, inviteForm }: { step: FirstRequestStep; free: WorkspaceFreeRequests | null; inviteForm?: ReactNode }) {
  switch (step) {
    case "framing": return <>
      <p>Describe what people can’t do, or what goes wrong for them, rather than the fix you have in mind.</p>
      <p>When you review the Request, Lane checks the framing. If it reads like a solution, Lane suggests the problem behind it for you to confirm or change.</p>
    </>;
    case "prediction": return <>
      <p>Pick the metric you want to move from the Metrics library, with where it is now and where you want it to go. If it isn’t there yet, add it from the picker. Work with nothing to measure can say why instead.</p>
      <p><Link href="/settings/metrics" className={styles.link}>Open the Metrics library</Link></p>
    </>;
    case "reviewers": return <>
      <p>Reviewers are optional. The teammates you ask answer Looks good or Raise a concern before work starts, and never hold up pickup. Only Admins and Members can review.</p>
      {inviteForm ?? <p>Ask an Admin to invite teammates you want as Reviewers.</p>}
    </>;
    case "free_requests": return <>
      {free && <p className={styles.free}>{freeRequestsNote(free.planState, free.free)}</p>}
      <p>Every workspace gets {FREE_REQUESTS} Free Requests with all of Lane, for any number of people and no time limit. Each Request created counts, including deleted ones.</p>
    </>;
    case "release": return <>
      <p>When the work is Done, record the Release: when your audience got it. Lane then measures for the window you chose and sets the Result due date.</p>
      <p>{COMING_BACK}</p>
    </>;
  }
}

/**
 * #217 (spec #195, item 6): the first run. The workspace's first person is walked through filing a first real
 * Request one step at a time (framing, a library metric, Reviewers with invites, Free Requests left, Release and
 * Result due), then told what happens next. People who join later get a short first run that shows their Inbox.
 * Either can be skipped and found again from help ("First-run guide" in the account menu).
 */
export function FirstRunGuideView({ view, step, workspaceName, free, inviteForm, readsNeedsYou, placement, busy = false, error = null, showSteps = false, onStep, onShowSteps = () => {}, onSkip, onFinish, onOpenInbox, onFile }: FirstRunGuideViewProps) {
  const failure = error ? <div className={styles.error}><Alert role="alert" tone="danger" title={error} /></div> : null;
  if (view.guide === "joined") return <section className={styles.guide} aria-labelledby="first-run-heading" data-first-run="joined">
    <div className={styles.body}>
      <h2 id="first-run-heading" tabIndex={-1}>Welcome to {workspaceName}</h2>
      {readsNeedsYou
        ? <p>Your Inbox is where work finds you. Needs you lists the reviews you’re asked for, Concerns on your Requests and results that are due; it clears itself as they’re done. For your information lists updates on your Requests.</p>
        : <p>Your Inbox lists updates on the Requests you can see: when one is picked up, done or commented on.</p>}
    </div>
    {failure}
    <div className={styles.actions}>
      <Button variant="ghost" size="sm" onClick={onSkip} disabled={busy}>Skip</Button>
      <Link href="/inbox" onClick={onOpenInbox} className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.sm}`}>Open your Inbox</Link>
    </div>
  </section>;

  if (view.filed && !showSteps) return <section key="filed" className={styles.guide} aria-labelledby="first-run-heading" data-first-run="first_request" data-first-run-filed="">
    <div className={styles.body}>
      <h2 id="first-run-heading" tabIndex={-1}>Your first Request is filed</h2>
      {free && <p className={styles.free}>{freeRequestsNote(free.planState, free.free)}</p>}
      <p>Any Reviewers you asked answer before work starts. When it’s Done, record the Release, and Lane sets the Result due date. {COMING_BACK}</p>
    </div>
    {failure}
    <div className={styles.actions}>
      <Button variant="ghost" size="sm" onClick={onShowSteps}>See the steps again</Button>
      <Button size="sm" onClick={onFinish} loading={busy}>Finish the guide</Button>
    </div>
  </section>;

  const index = FIRST_REQUEST_STEPS.indexOf(step);
  const previous = FIRST_REQUEST_STEPS[index - 1];
  const next = FIRST_REQUEST_STEPS[index + 1];
  const position = `Step ${index + 1} of ${FIRST_REQUEST_STEPS.length}`;
  // Read again after the first Request is filed, the steps explain filing any Request, and closing them finishes the guide.
  return <section key="steps" className={styles.guide} aria-labelledby="first-run-heading" data-first-run="first_request">
    <div className={styles.body}>
      <h2 id="first-run-heading" tabIndex={-1}>{view.filed ? "How a Request goes" : "File your first Request"}</h2>
      <div className={styles.position}>
        <span aria-hidden="true">{position}</span>
        <Progress className={styles.progress} value={index + 1} max={FIRST_REQUEST_STEPS.length} aria-label={`${position}: ${STEP_TITLES[step]}`} />
      </div>
      <div className={styles.step} data-first-run-step={step}>
        <h3 tabIndex={-1}>{STEP_TITLES[step]}</h3>
        <StepBody step={step} free={free} inviteForm={inviteForm} />
      </div>
    </div>
    {failure}
    <div className={styles.actions}>
      {view.filed
        ? <Button variant="ghost" size="sm" onClick={onFinish} disabled={busy}>Finish the guide</Button>
        : <Button variant="ghost" size="sm" onClick={onSkip} disabled={busy}>Skip the guide</Button>}
      <span className={styles.spacer} />
      {previous && <Button variant="ghost" size="sm" onClick={() => onStep(previous)}>Back</Button>}
      {next && <Button variant="secondary" size="sm" onClick={() => onStep(next)}>Next step</Button>}
      {placement === "list" && <NewRequestLink guided onClick={onFile} className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.sm}`}>{view.filed ? "File a Request" : "File your first Request"}</NewRequestLink>}
    </div>
  </section>;
}
