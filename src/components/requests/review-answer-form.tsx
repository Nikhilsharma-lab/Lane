"use client";
import { useState } from "react";
import { Button } from "@/components/arc/button/button";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { Textarea } from "@/components/arc/textarea/textarea";
import { REVIEW_REASON_MAX, type ReviewDecision } from "@/lib/request-reviewer-rules";
import { FocusOnArrival } from "./focus-on-arrival";
import styles from "./request-timeline.module.css";
import popupStyles from "@/components/popup/popup.module.css";

export type ReviewAnswer = Pick<ReviewDecision, "kind" | "reason">;

const ANSWERS = [{ value: "looks_good", label: "Looks good" }, { value: "concern", label: "Raise a concern" }];

/**
 * #279: a reviewer's answer in the Journey popup, loaded when it first opens. Raise a concern asks what concerns them;
 * Change answer, once they've answered, lets them pick again, starting from what they said. Saving closes the popup at
 * once and the answer shows straight away (`onAnswer`).
 */
export function ReviewAnswerForm({ changing, initial, error, onAnswer, onCancel }: {
  /** Change answer: they've answered before, so both answers are offered. */
  changing: boolean;
  initial: ReviewAnswer;
  /** Why the last try was refused; their words are kept. */
  error: string;
  onAnswer: (answer: ReviewAnswer) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<ReviewAnswer["kind"]>(initial.kind);
  const [reason, setReason] = useState(initial.reason);
  const concern = kind === "concern";
  return <FocusOnArrival><form className={styles.stack} onSubmit={(event) => {
    event.preventDefault();
    if (concern && !reason.trim()) return;
    onAnswer({ kind, reason: concern ? reason : "" });
  }}>
    {changing && <RadioGroup label="Your answer" options={ANSWERS} value={kind} onValueChange={(value) => setKind(value as ReviewAnswer["kind"])} />}
    {concern && <Textarea label="What concerns you?" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={REVIEW_REASON_MAX} required />}
    {error && <p role="alert">{error}</p>}
    <div className={popupStyles.actions}>
      <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button type="submit" disabled={concern && !reason.trim()}>{changing ? "Save answer" : "Raise concern"}</Button>
    </div>
  </form></FocusOnArrival>;
}
