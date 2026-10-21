"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useOptimisticAction } from "./use-optimistic-action";
import { Button } from "@/components/arc/button/button";
import { Textarea } from "@/components/arc/textarea/textarea";
import { Select } from "@/components/arc/select/select";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { nomineeKey as keyOf, REVIEW_NOTE_MAX, REVIEW_REASON_MAX, reviewStateOf } from "@/lib/request-agreement";
import * as actions from "@/app/(app)/requests/[id]/agreement-actions";
import { useReportReviewState } from "./pickup-confirmation";
import styles from "./request-agreement.module.css";
type View = Exclude<
  Awaited<ReturnType<typeof actions.readReviews>>,
  { error: string }
>;
type People = Extract<
  Awaited<ReturnType<typeof actions.loadReviewerPeople>>,
  { people: unknown }
>["people"];
type Kind = "addReviewers" | "removeReviewer" | "answerReview";
const SAVED: Record<Kind, string> = {
  addReviewers: "Reviewer added",
  removeReviewer: "Reviewer removed",
  answerReview: "Review saved",
};

function status(reviewer: View["reviewers"][number], open: boolean) {
  if (reviewer.decision?.kind === "looks_good") return "Looks good";
  if (reviewer.decision?.kind === "concern") return "Raised a concern";
  if (!open) return "No answer before pickup";
  if (reviewer.invitation === "pending") return "Invitation pending";
  return "Waiting";
}

/**
 * Optional reviewers look at an Open Request before work starts. Each answers
 * Looks good or raises a concern with a reason. Reviews never block pickup;
 * once work starts the list is a read-only record.
 */
export function RequestAgreementPanel({
  requestId,
  orgId,
  isAdmin,
  isGuest,
  revision,
}: {
  requestId: string;
  orgId: string;
  isAdmin: boolean;
  isGuest: boolean;
  revision?: number;
}) {
  const runAction = useOptimisticAction();
  const { toast } = useToastStack();
  const [view, setView] = useState<View | null>(null);
  const [people, setPeople] = useState<People>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [concernFor, setConcernFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  const running = useRef(false);
  const reportReviewState = useReportReviewState();
  // #77: pickup confirms from what this panel last read, which is newer than the
  // page's or the preview's loaded copy once a reviewer is added, removed or answers.
  useEffect(() => {
    if (!view) return;
    reportReviewState(view.requestId, reviewStateOf(view.reviewers));
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
      applyView(await actions.readReviews(requestId, { orgId }));
    } catch {
      setError("Could not load reviews. Try again.");
    }
  }, [applyView, requestId, orgId]);
  useEffect(() => {
    let active = true;
    void actions.readReviews(requestId, { orgId })
      .then((result) => { if (active) applyView(result); })
      .catch(() => { if (active) setError("Could not load reviews. Try again."); });
    return () => { active = false; };
  }, [applyView, requestId, orgId, revision]);
  useEffect(() => {
    if (isGuest || !adding || people.length) return;
    let active = true;
    void actions.loadReviewerPeople({ orgId })
      .then((result) => {
        if (!active) return;
        if ("error" in result) setError(result.error || "Could not load people.");
        else setPeople(result.people);
      })
      .catch(() => { if (active) setError("Could not load people. Try again."); });
    return () => { active = false; };
  }, [adding, isGuest, orgId, people.length]);

  async function run(kind: Kind, input: unknown): Promise<boolean> {
    if (!view || running.current) return false;
    running.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify({ kind, input, revision: view.revision });
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, id: crypto.randomUUID() };
    try {
      const operationId = retry.current.id;
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
      <section id="agreement" aria-label="Reviewers" className={styles.panel}>
        <h2>Reviewers</h2>
        {error ? <><p role="alert">{error}</p><Button variant="secondary" onClick={() => { void load(); }}>Retry</Button></> : <p role="status">Loading reviewers…</p>}
      </section>
    );

  const options = people
    .filter((p) => !view.unavailable.includes(keyOf(p.nominee)))
    .map((p) => ({
      value: keyOf(p.nominee),
      label: p.name + (p.nominee.kind === "invitation" ? " · Invitation pending" : ""),
    }));

  return (
    <section id="agreement" aria-labelledby="agreement-heading" className={styles.panel} aria-busy={busy}>
      <div className={styles.header}>
        <h2 id="agreement-heading">Reviewers</h2>
        {view.canAdd && !adding && (
          <Button variant="ghost" className={styles.end} onClick={() => { setAdding(true); setSelected(""); setNote(""); }} disabled={busy}>Add reviewer</Button>
        )}
      </div>
      {view.open && <p className={styles.muted}>Optional. People who should look at this before work starts.</p>}

      {adding && (
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
              placeholder={people.length ? "Choose a person" : "Loading people…"}
              value={selected}
              onValueChange={setSelected}
              options={options}
              disabled={busy || !people.length}
            />
          </div>
          <Textarea
            label="Question (optional)"
            description="They see it on the Request and in their notification."
            placeholder="Can we build this with the current API?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={REVIEW_NOTE_MAX}
            rows={2}
            disabled={busy}
          />
          <div className={styles.controls}>
            <Button type="submit" disabled={busy || !selected}>{busy ? "Adding…" : "Add"}</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)} disabled={busy}>Cancel</Button>
            {view.canInvite
              ? <Link href="/settings/members" className={styles.muted}>Invite someone</Link>
              : isAdmin ? null : <span className={styles.muted}>Missing someone? Ask an admin to invite them.</span>}
          </div>
        </form>
      )}

      {view.reviewers.length ? (
        <ul className={styles.seats}>
          {view.reviewers.map((reviewer) => {
            const decision = reviewer.decision;
            return (
              <li key={reviewer.id} className={reviewer.active ? styles.seat : `${styles.seat} ${styles.inactive}`}>
                <span>{reviewer.name}</span>
                <span className={styles.role}>{reviewer.active ? reviewer.role : "No longer in the workspace"}</span>
                <span className={decision?.kind === "concern" ? styles.warning : styles.muted}>{status(reviewer, view.open)}</span>
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
