"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Textarea } from "@/components/arc/textarea/textarea";
import { MAX_REVIEWERS, reviewerKey, REVIEW_NOTE_MAX } from "@/lib/request-reviewer-rules";
import { loadReviewerPeople } from "@/app/(app)/requests/[id]/reviewer-actions";
import { PickerOptions, focusOnOpen, pickerPopoverProps, searchListKeyDown } from "./request-property-pickers";
import labelStyles from "./request-labels.module.css";
import pickerStyles from "./request-property-pickers.module.css";

export type ReviewerChoice = Extract<Awaited<ReturnType<typeof loadReviewerPeople>>, { people: unknown }>["people"][number];

export const REVIEWERS_SUBTEXT = "Add people who should look at this before work starts. Optional.";

/** The optional question asked with a review, the same on Request detail and while creating. */
export const REVIEW_QUESTION = {
  label: "Question (optional)",
  description: "They see it on the Request and in their notification.",
  placeholder: "Can we build this with the current API?",
} as const;

/** Shown after a person who is invited but has not joined yet. */
export const INVITATION_PENDING = " · Invitation pending";

/**
 * The people a reviewer can be chosen from, for the creation picker and for
 * adding on Request detail: members, plus pending invitations for admins.
 * Nothing is fetched until `load` is called; `load` again retries.
 */
export function useReviewerPeople(orgId: string) {
  const [people, setPeople] = useState<ReviewerChoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadReviewerPeople({ orgId });
      if (!mounted.current) return;
      if ("error" in result) setError(result.error ?? "Could not load people. Try again.");
      else setPeople(result.people);
    } catch {
      if (mounted.current) setError("Could not load people. Try again.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [orgId]);
  return { people, loading, error, load };
}

/** "Reviewers", one name, or "3 reviewers". */
export function reviewerSummary(chosen: { name: string }[]) {
  return chosen.length > 1 ? `${chosen.length} reviewers` : chosen[0]?.name ?? "Reviewers";
}

/**
 * #78: the Reviewers property on the compose step, beside Project, Labels and
 * Priority. The people come from the same loader as adding from Request
 * detail (members, plus pending invitations for admins), fetched once when the
 * popover first opens and filtered locally. The requester is left out; the
 * server checks every rule again when the Request is created. Once someone is
 * chosen, the same optional question as on detail is offered; every chosen
 * reviewer is sent it.
 */
export function RequestReviewersPicker({ orgId, value, onChange, question, onQuestionChange, excludeUserId, disabled, error }: {
  orgId: string;
  value: ReviewerChoice[];
  onChange: (next: ReviewerChoice[]) => void;
  question: string;
  onQuestionChange: (next: string) => void;
  excludeUserId: string;
  disabled?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { people, loading, error: loadError, load } = useReviewerPeople(orgId);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const chosenKeys = new Set(value.map((person) => reviewerKey(person.nominee)));
  const isSelected = (person: ReviewerChoice) => chosenKeys.has(reviewerKey(person.nominee));
  const needle = query.trim().toLowerCase();
  const matches = (people ?? [])
    .filter((person) => !(person.nominee.kind === "member" && person.nominee.userId === excludeUserId))
    .filter((person) => !needle || person.name.toLowerCase().includes(needle) || person.email.includes(needle));
  // Chosen people stay first, so the list reads as the selection plus everyone else.
  const options = [...value.filter((person) => !needle || matches.some((m) => reviewerKey(m.nominee) === reviewerKey(person.nominee))), ...matches.filter((person) => !isSelected(person))];
  const full = value.length >= MAX_REVIEWERS;
  function toggle(person: ReviewerChoice) {
    if (isSelected(person)) onChange(value.filter((chosen) => reviewerKey(chosen.nominee) !== reviewerKey(person.nominee)));
    else if (!full) onChange([...value, person]);
  }

  return <Popover open={open} onOpenChange={(next) => {
    setOpen(next);
    setQuery("");
    if (next && !people && !loading) void load();
  }}>
    <PopoverTrigger asChild>
      <Button type="button" id="intake-reviewers" variant="secondary" size="sm" className={pickerStyles.trigger} disabled={disabled}
        aria-invalid={Boolean(error) || undefined} aria-describedby={error ? "intake-reviewers-error" : undefined}
        aria-label={value.length ? `Reviewers: ${value.map((person) => person.name).join(", ")}` : "Reviewers"}>
        <span className={pickerStyles.chipContent}><Users aria-hidden="true" /><span className={pickerStyles.chipLabel}>{reviewerSummary(value)}</span></span>
      </Button>
    </PopoverTrigger>
    <PopoverContent {...pickerPopoverProps} inert={open ? undefined : true} aria-label="Reviewers" className={labelStyles.panel} onOpenAutoFocus={(event) => focusOnOpen(event, searchRef)}>
      <div className={labelStyles.search}>
        <SearchField ref={searchRef} label="Search people" hideLabel placeholder="Add reviewers…" maxLength={100} value={query} onValueChange={setQuery}
          onKeyDown={(event) => searchListKeyDown(event, options, optionRefs, toggle)} />
      </div>
      <p className={labelStyles.caption}>{REVIEWERS_SUBTEXT}</p>
      {people && <PickerOptions items={options} label="People" optionRefs={optionRefs} searchRef={searchRef} keyOf={(person) => reviewerKey(person.nominee)}
        isSelected={isSelected} isInert={(person) => full && !isSelected(person)} onChoose={toggle} multiselectable morph="plain"
        render={(person) => <span>{person.name}{person.nominee.kind === "invitation" && <span className={labelStyles.scopeHint}>{INVITATION_PENDING}</span>}</span>}
        emptyText={needle ? "No matching people" : "Nobody else to ask yet"} />}
      {loading && <p role="status" className={labelStyles.caption}>Loading people…</p>}
      {loadError && <><p role="alert" className={labelStyles.error}>{loadError}</p><Button type="button" size="sm" variant="secondary" onClick={() => void load()}>Retry</Button></>}
      {full && <p role="status" className={labelStyles.caption}>A Request can have at most {MAX_REVIEWERS} reviewers.</p>}
      {value.length > 0 && <div className={labelStyles.question}>
        <Textarea label={REVIEW_QUESTION.label} description={REVIEW_QUESTION.description} placeholder={REVIEW_QUESTION.placeholder}
          value={question} onChange={(event) => onQuestionChange(event.target.value)} maxLength={REVIEW_NOTE_MAX} rows={2} disabled={disabled} />
      </div>}
    </PopoverContent>
  </Popover>;
}
