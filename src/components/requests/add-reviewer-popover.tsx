"use client";
import { useEffect, useRef, useState, type Ref } from "react";
import { Button } from "@/components/arc/button/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Textarea } from "@/components/arc/textarea/textarea";
import { Placeholder } from "@/components/loading/placeholder";
import { MAX_REVIEWERS, reviewerKey, REVIEW_NOTE_MAX } from "@/lib/request-reviewer-rules";
import { PickerOptions, focusOnOpen, pickerPopoverProps, searchListKeyDown } from "./request-property-pickers";
import { REVIEW_QUESTION, useReviewerPeople, type ReviewerChoice } from "./request-reviewers-picker";
import { ReviewerInviteHint } from "./reviewer-invite-hint";
import labelStyles from "./request-labels.module.css";
import pickerStyles from "./request-property-pickers.module.css";

/**
 * #279: Add reviewer on Request detail, an Arc popover like the composer's Reviewers picker: search the workspace's
 * Admins and Members, pick one or more, add the optional question, then Add reviewer. The people load when it first
 * opens. The popover closes at once and the reviewers show straight away (`onAdd`); the server checks every rule.
 * Closing it any other way (Escape, a press outside) keeps the picks and the question for the next opening, so nothing
 * typed is lost and nothing needs asking.
 */
export function AddReviewerPopover({ orgId, unavailable, canInvite, slots, onAdd, triggerRef, className, defaultOpen = false }: {
  orgId: string;
  /** Who can't be picked: the viewer, the Requester and anyone already reviewing (readReviews' `unavailable`). */
  unavailable: string[];
  canInvite: boolean;
  /** How many more reviewers the Request can take. */
  slots: number;
  onAdd: (people: ReviewerChoice[], note: string) => void;
  triggerRef?: Ref<HTMLButtonElement>;
  className?: string;
  /** Pressed before this code arrived: it opens as it arrives. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<ReviewerChoice[]>([]);
  const [note, setNote] = useState("");
  const { people, loading, error, load } = useReviewerPeople(orgId);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (defaultOpen) void load(); }, [defaultOpen, load]);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const chosenKeys = new Set(chosen.map((person) => reviewerKey(person.nominee)));
  const isChosen = (person: ReviewerChoice) => chosenKeys.has(reviewerKey(person.nominee));
  const needle = query.trim().toLowerCase();
  const options = (people ?? [])
    .filter((person) => !unavailable.includes(reviewerKey(person.nominee)))
    .filter((person) => !needle || person.name.toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle));
  const full = chosen.length >= slots;
  const toggle = (person: ReviewerChoice) => {
    if (isChosen(person)) setChosen(chosen.filter((c) => reviewerKey(c.nominee) !== reviewerKey(person.nominee)));
    else if (!full) setChosen([...chosen, person]);
  };
  const openChange = (next: boolean) => {
    setOpen(next);
    setQuery("");
    if (next && !people && !loading) void load();
  };

  return <Popover open={open} onOpenChange={openChange}>
    <PopoverTrigger asChild>
      <Button ref={triggerRef} type="button" variant="ghost" className={className}>Add reviewer</Button>
    </PopoverTrigger>
    <PopoverContent {...pickerPopoverProps} inert={open ? undefined : true} aria-label="Add reviewer" className={labelStyles.panel} onOpenAutoFocus={(event) => focusOnOpen(event, searchRef)}>
      <form onSubmit={(event) => {
        event.preventDefault();
        if (!chosen.length) return;
        onAdd(chosen, note);
        setOpen(false);
        setChosen([]);
        setNote("");
      }}>
        <div className={labelStyles.search}>
          <SearchField ref={searchRef} label="Search people" hideLabel placeholder="Search people…" maxLength={100} value={query} onValueChange={setQuery}
            onKeyDown={(event) => searchListKeyDown(event, options, optionRefs, toggle)} />
        </div>
        {people && <PickerOptions items={options} label="People" optionRefs={optionRefs} searchRef={searchRef} keyOf={(person) => reviewerKey(person.nominee)}
          isSelected={isChosen} isInert={(person) => full && !isChosen(person)} onChoose={toggle} multiselectable morph="plain"
          render={(person) => <span className={pickerStyles.optionDetails}><span>{person.name}</span><small>{person.email}</small></span>}
          emptyText={needle ? "No Admin or Member matches" : "Nobody else to ask yet"} />}
        {people && <ReviewerInviteHint canInvite={canInvite} linked={false} className={labelStyles.caption} />}
        {loading && <Placeholder label="Loading people" lines={2} />}
        {error && <><p role="alert" className={labelStyles.error}>{error}</p><Button type="button" size="sm" variant="secondary" onClick={() => { searchRef.current?.focus(); void load(); }}>Try again</Button></>}
        {full && chosen.length > 0 && <p role="status" className={labelStyles.caption}>A Request can have at most {MAX_REVIEWERS} reviewers.</p>}
        <div className={labelStyles.question}>
          <Textarea label={REVIEW_QUESTION.label} description={REVIEW_QUESTION.description} placeholder={REVIEW_QUESTION.placeholder}
            value={note} onChange={(event) => setNote(event.target.value)} maxLength={REVIEW_NOTE_MAX} rows={2} />
        </div>
        <div className={`${labelStyles.actions} ${labelStyles.caption}`}>
          <Button type="submit" size="sm" disabled={!chosen.length}>{chosen.length > 1 ? `Add ${chosen.length} reviewers` : "Add reviewer"}</Button>
        </div>
      </form>
    </PopoverContent>
  </Popover>;
}
