"use client";
import { changeAttempt, type ChangeAttempt } from "./change-attempt";
import { callAction } from "@/lib/action-call";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOptimisticAction } from "./use-optimistic-action";
import { Button } from "@/components/arc/button/button";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { offerUndo } from "./undo-toast";
import { MAX_REVIEWERS, reviewerKey as keyOf, reviewStateOf, type ReviewerOutline } from "@/lib/request-reviewer-rules";
import * as actions from "@/app/(app)/requests/[id]/reviewer-actions";
import { useReportReviewState } from "./pickup-confirmation";
import { isPendingReviewer, withAnswer, withReviewerBack, withReviewersAdded, withoutReviewer } from "./reviewer-changes";
import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog";
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup";
import { focusWithoutScroll } from "@/components/popup/focus";
import type { ReviewAnswer } from "./review-answer-form";
import styles from "./request-timeline.module.css";
import { Placeholder } from "@/components/loading/placeholder";
import { SectionHeading } from "./section-heading";
type View = Exclude<
  Awaited<ReturnType<typeof actions.readReviews>>,
  { error: string }
>;
type Reviewer = View["reviewers"][number];
type Kind = "addReviewers" | "removeReviewer" | "answerReview" | "restoreReviewer";

const OPTIONAL_LINE = "Optional. People who should look at this before work starts.";

// The answer popup's form loads when it first opens, or a moment earlier, when the pointer or focus reaches an answer
// button.
const answerCode = popupCode(() => import("./review-answer-form"));
// Add reviewer's popover arrives on its own, fetched as the panel mounts, while the reviewers are read.
const addCode = popupCode(() => import("./add-reviewer-popover"));

function reviewStatusLabel(reviewer: Reviewer, open: boolean) {
  if (reviewer.decision?.kind === "looks_good") return "Looks good";
  if (reviewer.decision?.kind === "concern") return "Raised a concern";
  if (!open) return "No answer before pickup";
  return "Waiting";
}

/** A reviewer's row, found by id, for focus after a change. */
const rowControl = (id: string, selector: string) => document.querySelector<HTMLElement>(`#reviewers [data-reviewer-id="${id}"] ${selector}`);

/**
 * The timeline's Open step: reviews (#134).
 * Optional reviewers look at an Open Request before work starts. Each answers
 * Looks good or raises a concern with a reason. Reviews never block pickup;
 * once work starts the list is a read-only record.
 *
 * #279: every change shows at once and goes back if the server refuses: adding (an Arc popover), removing (with Undo
 * for 10 seconds, which puts the reviewer back exactly as they were), Looks good and Raise a concern (in the Journey
 * popup). Once answered, a reviewer's one button reads Change answer.
 */
export function RequestReviews({
  requestId,
  orgId,
  isGuest,
  revision,
  expected,
  deferred = false,
}: {
  requestId: string;
  orgId: string;
  isGuest: boolean;
  revision?: number;
  /** What the Request already says about its reviewers and this reader, so the loading state holds their shape (#295). */
  expected?: { reviewers: ReviewerOutline[]; open: boolean; canAdd: boolean; canRemove: boolean };
  /** Holds the read back while true. Next sends server reads one at a time, so the journey's own reads go first (#295). */
  deferred?: boolean;
}) {
  const runAction = useOptimisticAction();
  const toasts = useToastStack();
  const [view, setShown] = useState<View | null>(null);
  // The list as shown, read by changes and Undo after the render that made them.
  const shown = useRef<View | null>(null);
  const setView = useCallback((next: View | null) => { shown.current = next; setShown(next); }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The answer popup: whose answer, and whether it changes one already given.
  const [answering, setAnswering] = useState<{ id: string; changing: boolean; initial: ReviewAnswer; error: string } | null>(null);
  const [answerOpen, setAnswerOpen] = useState(false);
  const retry = useRef<ChangeAttempt | null>(null);
  const running = useRef(false);
  // Each change counts up, so a read that a later change overtook never undoes what that change shows.
  const changes = useRef(0);
  const addButton = useRef<HTMLButtonElement>(null);
  const reportReviewState = useReportReviewState();
  // #77: pickup confirms from what this panel last read, which is newer than the
  // page's or the preview's loaded copy once a reviewer is added, removed or answers.
  useEffect(() => {
    if (!view) return;
    reportReviewState(view.requestId, reviewStateOf(view.reviewers.map((r) => ({ ...r, counts: r.active }))));
    return () => reportReviewState(view.requestId, undefined);
  }, [reportReviewState, view]);

  const applyView = useCallback((result: Awaited<ReturnType<typeof actions.readReviews>>) => {
    if ("error" in result) {
      setError(result.error || "Couldn’t load reviews.");
      return;
    }
    setError("");
    setView(result);
  }, [setView]);
  const load = useCallback(async () => {
    const at = changes.current;
    const current = () => at === changes.current && !running.current;
    try {
      const result = await callAction(() => actions.readReviews(requestId, { orgId }));
      if (current()) applyView(result);
    } catch {
      if (current()) setError("Couldn’t load reviews. Try again.");
    }
  }, [applyView, requestId, orgId]);
  useEffect(() => {
    if (deferred) return;
    let active = true;
    // A change made while this read was out shows what it did; the read that change makes comes after it.
    const at = changes.current;
    const current = () => active && at === changes.current && !running.current;
    void callAction(() => actions.readReviews(requestId, { orgId }))
      .then((result) => { if (current()) applyView(result); })
      .catch(() => { if (current()) setError("Couldn’t load reviews. Try again."); });
    return () => { active = false; };
  }, [applyView, requestId, orgId, revision, deferred]);

  /**
   * Shows `show`'s list at once and sends the change. A refusal puts back the list as it was and says why: inline, or
   * through `onRefused`. A saved change reads the list again, quietly, for the server's own rows.
   */
  async function change(kind: Kind, input: unknown, show: (view: View) => View, onRefused?: (message: string) => void): Promise<{ revision: number } | null> {
    const before = shown.current;
    if (!before || running.current) return null;
    running.current = true;
    changes.current += 1;
    setBusy(true);
    setError("");
    setView(show(before));
    const refused = (message: string) => { setView(before); if (onRefused) onRefused(message); else setError(message); };
    const { operationId } = retry.current = changeAttempt(retry.current, { kind, input }, before.revision);
    try {
      const outcome = await runAction({
        id: requestId,
        waitForPending: true,
        refreshOnError: false,
        run: () => actions[kind]({ orgId, requestId, expectedRevision: before.revision, operationId }, input),
        onError: (message, { thrown, offline }) => refused(thrown && !offline ? "Couldn’t confirm the change. Try again." : message),
      });
      if (outcome.status === "skipped") refused("Couldn’t confirm the change. Try again.");
      if (outcome.status !== "success" || !("success" in outcome.value)) return null;
      retry.current = null;
      const saved = { revision: outcome.value.revision };
      if (shown.current) setView({ ...shown.current, revision: saved.revision });
      void load();
      return saved;
    } catch {
      refused("Couldn’t confirm the change. Try again.");
      return null;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function add(people: { nominee: { kind: "member"; userId: string }; name: string }[], note: string) {
    void change("addReviewers", { nominees: people.map((p) => p.nominee), note },
      (v) => withReviewersAdded(v, people.map((p) => ({ key: keyOf(p.nominee), name: p.name })), note));
  }

  async function remove(reviewer: Reviewer) {
    const current = shown.current;
    if (!current) return;
    const { removed } = withoutReviewer(current, reviewer.id);
    if (!removed) return;
    // The row is going, so focus goes to the section's heading.
    focusWithoutScroll(document.getElementById("reviewers-heading"));
    const saved = await change("removeReviewer", { reviewerId: reviewer.id }, (v) => withoutReviewer(v, reviewer.id).shown);
    if (!saved) return;
    // Undo: the same entry back in its place (restoreReviewer), only if nothing changed since.
    const name = removed.entry.name;
    offerUndo(toasts, `reviewer-removed:${reviewer.id}`, { title: "Reviewer removed", description: `${reviewer.name} is no longer asked to review.` }, {
      undoing: { title: "Putting reviewer back", description: `${name} is going back on the list.` },
      undone: { title: "Reviewer back", description: `${name} is asked to review again, as before.` },
      run: async (failed) => Boolean(await change("restoreReviewer", { reviewerId: removed.entry.id }, (v) => withReviewerBack(v, removed), failed)),
    });
  }

  function answer(reviewer: Reviewer, given: ReviewAnswer, changing: boolean) {
    void change("answerReview", { reviewerId: reviewer.id, ...given }, (v) => withAnswer(v, reviewer.id, given), (message) => {
      // Refused: the popup comes back with their words and why.
      if (given.kind === "concern" || changing) { setAnswering({ id: reviewer.id, changing, initial: given, error: message }); setAnswerOpen(true); }
      else setError(message);
    });
  }

  function looksGood(reviewer: Reviewer) {
    answer(reviewer, { kind: "looks_good", reason: "" }, false);
    // The answer buttons give way to Change answer, which takes focus.
    requestAnimationFrame(() => focusWithoutScroll(rowControl(reviewer.id, "[data-review-answer]")));
  }

  // While a change is on its way the buttons wait (it is sent against the list's revision) but keep focus, so focus
  // can rest on the button a change just showed.
  const held = busy || undefined;
  const answerForm = usePopupCode(answerCode, answerOpen, () => couldNotOpen("review-answer", setAnswerOpen));
  const [addPressed, setAddPressed] = useState(false);
  useEffect(() => { if (!isGuest) addCode.preload(); }, [isGuest]);
  const addPopover = usePopupCode(addCode, addPressed, () => couldNotOpen("add-reviewer", setAddPressed), { ahead: true });
  const answeringReviewer = answering && view?.reviewers.find((r) => r.id === answering.id);

  if (!view && error)
    return (
      <section id="reviewers" aria-label="Reviewers" className={styles.reviews}>
        <SectionHeading level={4}>Reviewers</SectionHeading>
        <p role="alert">{error}</p><Button variant="secondary" onClick={() => { void load(); }}>Try again</Button>
      </section>
    );
  // #295: laid out as the list will be (Add reviewer's height, the Optional line, a row per saved reviewer), so the
  // journey keeps its height when the reviewers arrive.
  if (!view)
    return (
      <section id="reviewers" aria-label="Reviewers" className={styles.reviews}>
        <div className={expected?.canAdd ? `${styles.header} ${styles.holdsButton}` : styles.header} data-holds-button={expected?.canAdd ? "" : undefined}>
          <SectionHeading level={4}>Reviewers</SectionHeading>
        </div>
        {expected?.open && <p className={styles.muted}>{OPTIONAL_LINE}</p>}
        {expected?.reviewers.length
          ? <>
            <p role="status" className="sr-only">Loading reviewers…</p>
            {/* Build 2 (#262): the held rows fade in through the shared placeholder; its wrapper adds no box. */}
            <Placeholder><ul className={styles.reviewerList} aria-hidden="true">
              {expected.reviewers.map((reviewer, index) => <li key={index} className={styles.reviewer} data-pending="">
                <span className={styles.heldBar} />
                <span className={styles.heldBar} />
                <span className={styles.heldBar} />
                <span className={styles.controls}>{(expected.canRemove || (reviewer.mine && expected.canAdd)) && <span className={styles.heldButton} data-held-button=""><Button variant="ghost" disabled tabIndex={-1}>Remove</Button></span>}</span>
                {reviewer.note && <p className={`${styles.reason} ${styles.held}`} data-held-line=""><span className={styles.heldBar} /></p>}
                {reviewer.concern && <p className={`${styles.reason} ${styles.held}`} data-held-line=""><span className={styles.heldBar} /></p>}
              </li>)}
            </ul></Placeholder>
          </>
          : <p role="status" className={styles.muted}>Loading reviewers…</p>}
      </section>
    );

  return (
    <section id="reviewers" aria-labelledby="reviewers-heading" className={styles.reviews}>
      <div className={styles.header}>
        <SectionHeading level={4} id="reviewers-heading" tabIndex={-1}>Reviewers</SectionHeading>
        {view.canAdd && !isGuest && (
          addPopover
            ? <addPopover.AddReviewerPopover orgId={orgId} unavailable={view.unavailable} canInvite={view.canInvite} slots={MAX_REVIEWERS - view.reviewers.length}
              onAdd={add} triggerRef={addButton} className={styles.end} defaultOpen={addPressed} />
            : <Button variant="ghost" className={styles.end} onClick={() => setAddPressed(true)}>Add reviewer</Button>
        )}
      </div>
      {view.open && <p className={styles.muted}>{OPTIONAL_LINE}</p>}

      {view.reviewers.length ? (
        <ul className={styles.reviewerList}>
          {view.reviewers.map((reviewer) => {
            const decision = reviewer.decision;
            const pending = isPendingReviewer(reviewer);
            const ahead = { onPointerEnter: answerCode.preload, onFocus: answerCode.preload };
            return (
              <li key={reviewer.id} data-reviewer-id={reviewer.id} data-pending={pending ? "" : undefined} className={reviewer.active ? styles.reviewer : `${styles.reviewer} ${styles.inactive}`}>
                <span>{reviewer.name}</span>
                <span className={styles.role}>{reviewer.active ? reviewer.role : "No longer in the workspace"}</span>
                <span className={decision?.kind === "concern" ? styles.warning : styles.muted}>{reviewStatusLabel(reviewer, view.open)}</span>
                <span className={styles.controls}>
                  {reviewer.canAnswer && (decision
                    ? <Button variant="secondary" data-review-answer="" aria-disabled={held} {...ahead}
                      onClick={() => { if (busy) return; setAnswering({ id: reviewer.id, changing: true, initial: { kind: decision.kind, reason: decision.reason }, error: "" }); setAnswerOpen(true); }}>Change answer</Button>
                    : <>
                      {/* #279 (B13): secondary, so the strip's Pick up stays the one main button. */}
                      <Button variant="secondary" aria-disabled={held} onClick={() => { if (!busy) looksGood(reviewer); }}>Looks good</Button>
                      <Button variant="secondary" data-review-answer="" aria-disabled={held} {...ahead}
                        onClick={() => { if (busy) return; setAnswering({ id: reviewer.id, changing: false, initial: { kind: "concern", reason: "" }, error: "" }); setAnswerOpen(true); }}>Raise a concern</Button>
                    </>)}
                  {view.canRemove && (
                    <Button variant="ghost" disabled={pending} aria-disabled={held} aria-label={`Remove ${reviewer.name}`} onClick={() => { if (!busy) void remove(reviewer); }}>Remove</Button>
                  )}
                </span>
                {reviewer.note && <p className={`${styles.reason} ${styles.muted}`}>Asked: {reviewer.note}</p>}
                {decision?.kind === "concern" && <p className={styles.reason}>Concern: {decision.reason}</p>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.muted}>{view.open ? "No reviewers yet." : "No reviewers."}</p>
      )}
      {error && <p role="alert">{error}</p>}
      {/* #279: Raise a concern and Change answer open in the Journey popup (Lane's adaptive popup). */}
      <Dialog guardTypedText open={answerOpen} onOpenChange={setAnswerOpen}>
        {answering && <DialogContent title={answering.changing ? "Change answer" : "Raise a concern"} aria-describedby={undefined}
          returnFocus={() => rowControl(answering.id, "[data-review-answer]") ?? document.getElementById("reviewers-heading")}>
          {answerForm
            ? <answerForm.ReviewAnswerForm key={`${answering.id}:${answering.changing}:${answering.error}`} changing={answering.changing} initial={answering.initial} error={answering.error}
              onCancel={() => setAnswerOpen(false)}
              onAnswer={(given) => {
                setAnswerOpen(false);
                if (answeringReviewer) answer(answeringReviewer, given, answering.changing);
              }} />
            : <Placeholder label="Loading form" lines={2} />}
        </DialogContent>}
      </Dialog>
    </section>
  );
}
