"use client";
import { changeAttempt, type ChangeAttempt } from "./change-attempt";
import { callAction } from "@/lib/action-call";
import { useCallback, useEffect, useRef, useState } from "react";
import { useOptimisticAction } from "./use-optimistic-action";
import { Button } from "@/components/arc/button/button";
import { Textarea } from "@/components/arc/textarea/textarea";
import { Select } from "@/components/arc/select/select";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { reviewerKey as keyOf, REVIEW_NOTE_MAX, REVIEW_REASON_MAX, reviewStateOf } from "@/lib/request-reviewer-rules";
import * as actions from "@/app/(app)/requests/[id]/reviewer-actions";
import { useReportReviewState } from "./pickup-confirmation";
import { REVIEW_QUESTION, useReviewerPeople } from "./request-reviewers-picker";
import { ReviewerInviteHint } from "./reviewer-invite-hint";
import { InPageForm } from "@/components/popup/in-page-form";
import styles from "./request-timeline.module.css";
type View = Exclude<
  Awaited<ReturnType<typeof actions.readReviews>>,
  { error: string }
>;
type Kind = "addReviewers" | "removeReviewer" | "answerReview";
const SAVED: Record<Kind, string> = {
  addReviewers: "Reviewer added",
  removeReviewer: "Reviewer removed",
  answerReview: "Review saved",
};

function reviewStatusLabel(reviewer: View["reviewers"][number], open: boolean) {
  if (reviewer.decision?.kind === "looks_good") return "Looks good";
  if (reviewer.decision?.kind === "concern") return "Raised a concern";
  if (!open) return "No answer before pickup";
  return "Waiting";
}

/**
 * The timeline's Open step: reviews (#134).
 * Optional reviewers look at an Open Request before work starts. Each answers
 * Looks good or raises a concern with a reason. Reviews never block pickup;
 * once work starts the list is a read-only record.
 */
export function RequestReviews({
  requestId,
  orgId,
  isGuest,
  revision,
}: {
  requestId: string;
  orgId: string;
  isGuest: boolean;
  revision?: number;
}) {
  const runAction = useOptimisticAction();
  const { toast } = useToastStack();
  const [view, setView] = useState<View | null>(null);
  const { people: loaded, error: peopleError, load: loadPeople, loading: loadingPeople } = useReviewerPeople(orgId);
  const people = loaded ?? [];
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [concernFor, setConcernFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const retry = useRef<ChangeAttempt | null>(null);
  const running = useRef(false);
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
      setError(result.error || "Could not load reviews.");
      return;
    }
    setError("");
    setView(result);
  }, []);
  const load = useCallback(async () => {
    try {
      applyView(await callAction(() => actions.readReviews(requestId, { orgId })));
    } catch {
      setError("Could not load reviews. Try again.");
    }
  }, [applyView, requestId, orgId]);
  useEffect(() => {
    let active = true;
    void callAction(() => actions.readReviews(requestId, { orgId }))
      .then((result) => { if (active) applyView(result); })
      .catch(() => { if (active) setError("Could not load reviews. Try again."); });
    return () => { active = false; };
  }, [applyView, requestId, orgId, revision]);
  useEffect(() => {
    if (isGuest || !adding || loaded || loadingPeople || peopleError) return;
    void loadPeople();
  }, [adding, isGuest, loaded, loadingPeople, peopleError, loadPeople]);

  async function run(kind: Kind, input: unknown): Promise<boolean> {
    if (!view || running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    const { operationId } = retry.current = changeAttempt(retry.current, { kind, input }, view.revision);
    try {
      const outcome = await runAction({
        id: requestId,
        waitForPending: true,
        refreshOnError: false,
        run: () => actions[kind]({ orgId, requestId, expectedRevision: view.revision, operationId }, input),
        onError: (message, { thrown }) => setError(thrown ? "Couldn’t confirm the change. Try again." : message),
      });
      if (outcome.status !== "success") return false;
      retry.current = null;
      toast({ type: "success", title: SAVED[kind] });
      await load();
      return true;
    } catch {
      setError("Couldn’t confirm the change. Try again.");
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  if (!view)
    return (
      <section id="reviewers" aria-label="Reviewers" className={styles.reviews}>
        <h4>Reviewers</h4>
        {error ? <><p role="alert">{error}</p><Button variant="secondary" onClick={() => { void load(); }}>Retry</Button></> : <p role="status">Loading reviewers…</p>}
      </section>
    );

  const options = people
    .filter((p) => !view.unavailable.includes(keyOf(p.nominee)))
    .map((p) => ({
      value: keyOf(p.nominee),
      label: p.name,
    }));

  return (
    <section id="reviewers" aria-labelledby="reviewers-heading" className={styles.reviews} aria-busy={busy}>
      <div className={styles.header}>
        <h4 id="reviewers-heading">Reviewers</h4>
        {view.canAdd && !adding && (
          <Button ref={addButton} variant="ghost" className={styles.end} onClick={() => { setAdding(true); setSelected(""); setNote(""); }} disabled={busy}>Add reviewer</Button>
        )}
      </div>
      {view.open && <p className={styles.muted}>Optional. People who should look at this before work starts.</p>}

      {adding && (
        <InPageForm onDismiss={() => setAdding(false)} returnFocus={() => addButton.current ?? document.getElementById("reviewers-heading")}>
        <form
          className={styles.stack}
          onSubmit={(e) => {
            e.preventDefault();
            const nominee = people.find((p) => keyOf(p.nominee) === selected)?.nominee;
            if (!nominee) return;
            void run("addReviewers", { nominees: [nominee], note }).then((saved) => { if (saved) setAdding(false); });
          }}
        >
          <div className={styles.fields}>
            <Select
              label="Reviewer"
              placeholder={loaded ? (options.length ? "Choose a person" : "Nobody else to ask yet") : "Loading people…"}
              value={selected}
              onValueChange={setSelected}
              options={options}
              disabled={busy || !options.length}
            />
            <ReviewerInviteHint canInvite={view.canInvite} className={styles.muted} />
          </div>
          {peopleError && <div className={styles.controls}>
            <p role="alert">{peopleError}</p>
            <Button type="button" variant="secondary" onClick={() => { void loadPeople(); }}>Retry</Button>
          </div>}
          <Textarea
            label={REVIEW_QUESTION.label}
            description={REVIEW_QUESTION.description}
            placeholder={REVIEW_QUESTION.placeholder}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={REVIEW_NOTE_MAX}
            rows={2}
            disabled={busy}
          />
          <div className={styles.controls}>
            <Button type="submit" disabled={busy || !selected}>{busy ? "Adding…" : "Add"}</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)} disabled={busy}>Cancel</Button>
          </div>
        </form>
        </InPageForm>
      )}

      {view.reviewers.length ? (
        <ul className={styles.reviewerList}>
          {view.reviewers.map((reviewer) => {
            const decision = reviewer.decision;
            return (
              <li key={reviewer.id} data-reviewer-id={reviewer.id} className={reviewer.active ? styles.reviewer : `${styles.reviewer} ${styles.inactive}`}>
                <span>{reviewer.name}</span>
                <span className={styles.role}>{reviewer.active ? reviewer.role : "No longer in the workspace"}</span>
                <span className={decision?.kind === "concern" ? styles.warning : styles.muted}>{reviewStatusLabel(reviewer, view.open)}</span>
                <span className={styles.controls}>
                  {reviewer.canAnswer && concernFor !== reviewer.id && (
                    <>
                      {decision?.kind !== "looks_good" && <Button disabled={busy} onClick={() => void run("answerReview", { reviewerId: reviewer.id, kind: "looks_good", reason: "" })}>Looks good</Button>}
                      <Button variant="secondary" disabled={busy} onClick={() => { setConcernFor(reviewer.id); setReason(""); }}>Raise a concern</Button>
                    </>
                  )}
                  {view.canRemove && (
                    <Button variant="ghost" disabled={busy} aria-label={`Remove ${reviewer.name}`} onClick={() => void run("removeReviewer", { reviewerId: reviewer.id })}>Remove</Button>
                  )}
                </span>
                {reviewer.note && <p className={`${styles.reason} ${styles.muted}`}>Asked: {reviewer.note}</p>}
                {decision?.kind === "concern" && <p className={styles.reason}>{decision.reason}</p>}
                {concernFor === reviewer.id && (
                  <InPageForm onDismiss={() => setConcernFor(null)} returnFocus={() => document.querySelector<HTMLElement>(`#reviewers [data-reviewer-id="${reviewer.id}"] button:not(:disabled)`)}>
                  <form
                    className={styles.reason}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run("answerReview", { reviewerId: reviewer.id, kind: "concern", reason }).then((saved) => { if (saved) setConcernFor(null); });
                    }}
                  >
                    <Textarea label="What concerns you?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REVIEW_REASON_MAX} required disabled={busy} />
                    <div className={styles.controls}>
                      <Button type="submit" disabled={busy || !reason.trim()}>Raise concern</Button>
                      <Button type="button" variant="ghost" onClick={() => setConcernFor(null)} disabled={busy}>Cancel</Button>
                    </div>
                  </form>
                  </InPageForm>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.muted}>{view.open ? "No reviewers yet." : "No reviewers."}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
