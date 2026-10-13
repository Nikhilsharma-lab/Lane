"use client";

import { flushSync } from "react-dom";
import type { ComponentProps } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import { Button } from "@/components/arc/button/button";
import { motionTokens } from "@/components/arc/lib/motion-tokens";
import { ExpectedImpactFields } from "@/components/requests/expected-impact-fields";
import { expectedImpactSchema, impactDraftState, impactSummaryLines, type ExpectedImpactDraft } from "@/lib/request-impact";
import styles from "./expected-impact-disclosure.module.css";

export const IMPACT_PANEL_ID = "intake-impact-panel";

/** The first text field of the current kind, which Add and Edit focus. */
export function firstImpactField(kind: ExpectedImpactDraft["kind"]) {
  return document.getElementById(kind === "metric" ? "intake-impact-metric" : "intake-impact-result");
}

const opening: Transition = { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.standard] };
const closing: Transition = { duration: motionTokens.duration.exit, ease: [...motionTokens.ease.exit] };
const still: Transition = { duration: 0 };

/**
 * Plan item 2.3, decision 8.26: Expected impact stays required, behind one
 * disclosure row. A Lane composition of the Arc Button and motion tokens: Arc's
 * accordion is uncontrolled and its expandable card is a card surface with one
 * summary line, and this row needs a controlled panel (a failed submit opens it)
 * and a two-line summary in the composer's flow. Collapsed, the panel unmounts;
 * its values live in the composer's form state.
 */
export function ExpectedImpactDisclosure({ value, onChange, disabled, errors, open, instant = false, onOpenChange }: {
  value: ExpectedImpactDraft;
  onChange: (value: ExpectedImpactDraft) => void;
  disabled?: boolean;
  errors?: ComponentProps<typeof ExpectedImpactFields>["errors"];
  open: boolean;
  /** Opens without the height animation, when a failed submit moves focus into the panel. */
  instant?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const reduced = useReducedMotion();
  const state = impactDraftState(value);
  const complete = state === "complete" ? expectedImpactSchema.safeParse(value) : null;
  const lines = complete?.success ? impactSummaryLines(complete.data) : null;

  function toggle() {
    if (open) {
      // Done folds the panel without validating it; focus stays on this button.
      onOpenChange(false);
      return;
    }
    flushSync(() => onOpenChange(true));
    firstImpactField(value.kind)?.focus();
  }

  return <section id="intake-expected-impact" aria-labelledby="intake-impact-heading" tabIndex={-1} className={`@container ${styles.section}`}>
    <div className={styles.header}>
      <h2 id="intake-impact-heading" className={styles.heading}>Expected impact</h2>
      {!open && state !== "complete" && <span className={styles.state}>{state === "empty" ? "Required" : "Incomplete"}</span>}
      <Button type="button" variant="ghost" size="sm" className={styles.toggle} aria-expanded={open} aria-controls={IMPACT_PANEL_ID} onClick={toggle} disabled={disabled}>
        {open ? "Done" : <>{state === "empty" ? "Add" : "Edit"}<span className="sr-only"> expected impact</span></>}
      </Button>
    </div>
    {!open && lines && <div className={styles.summary}>
      <p className={styles.line} title={lines[0]}>{lines[0]}</p>
      <p className={styles.line} title={lines[1]}>{lines[1]}</p>
    </div>}
    <AnimatePresence initial={false}>
      {open && <motion.div
        key="panel"
        id={IMPACT_PANEL_ID}
        className={styles.panel}
        initial={reduced || instant ? false : { height: 0, opacity: 0, overflow: "hidden" }}
        animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
        exit={{ height: 0, opacity: 0, overflow: "hidden", transition: reduced ? still : closing }}
        transition={reduced || instant ? still : opening}
      >
        <div className={styles.fields}>
          <ExpectedImpactFields embedded value={value} onChange={onChange} disabled={disabled} errors={errors} />
        </div>
      </motion.div>}
    </AnimatePresence>
  </section>;
}
