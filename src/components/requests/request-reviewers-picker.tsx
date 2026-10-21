"use client";
import { useRef, useState } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import { SearchField } from "@/components/arc/search-field/search-field";
import { MAX_REVIEWERS, nomineeKey } from "@/lib/request-agreement";
import { loadReviewerPeople } from "@/app/(app)/requests/[id]/agreement-actions";
import { PickerOptions, focusOnOpen, pickerPopoverProps, searchListKeyDown } from "./request-property-pickers";
import labelStyles from "./request-labels.module.css";
import pickerStyles from "./request-property-pickers.module.css";

export type ReviewerChoice = Extract<Awaited<ReturnType<typeof loadReviewerPeople>>, { people: unknown }>["people"][number];

export const REVIEWERS_SUBTEXT = "Add people who should look at this before work starts. Optional.";

/** "Reviewers", one name, or "3 reviewers". */
export function reviewerSummary(chosen: { name: string }[]) {
  return chosen.length > 1 ? `${chosen.length} reviewers` : chosen[0]?.name ?? "Reviewers";
}

/**
 * #78: the Reviewers property on the compose step, beside Project, Labels and
 * Priority. The people come from the same loader as adding from Request
 * detail (members, plus pending invitations for admins), fetched once when the
 * popover first opens and filtered locally. The requester is left out; the
 * server checks every rule again when the Request is created.
 */
export function RequestReviewersPicker({ orgId, value, onChange, excludeUserId, disabled, error }: {
  orgId: string;
  value: ReviewerChoice[];
  onChange: (next: ReviewerChoice[]) => void;
  excludeUserId: string;
  disabled?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<ReviewerChoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await loadReviewerPeople({ orgId });
      if ("error" in result) setLoadError(result.error ?? "Could not load people. Try again.");
      else setPeople(result.people);
    } catch {
      setLoadError("Could not load people. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const chosenKeys = new Set(value.map((person) => nomineeKey(person.nominee)));
  const isSelected = (person: ReviewerChoice) => chosenKeys.has(nomineeKey(person.nominee));
  const needle = query.trim().toLowerCase();
  const matches = (people ?? [])
    .filter((person) => !(person.nominee.kind === "member" && person.nominee.userId === excludeUserId))
    .filter((person) => !needle || person.name.toLowerCase().includes(needle) || person.email.includes(needle));
  // Chosen people stay first, so the list reads as the selection plus everyone else.
  const options = [...value.filter((person) => !needle || matches.some((m) => nomineeKey(m.nominee) === nomineeKey(person.nominee))), ...matches.filter((person) => !isSelected(person))];
  const full = value.length >= MAX_REVIEWERS;
  function toggle(person: ReviewerChoice) {
    if (isSelected(person)) onChange(value.filter((chosen) => nomineeKey(chosen.nominee) !== nomineeKey(person.nominee)));
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
      {people && <PickerOptions items={options} label="People" optionRefs={optionRefs} searchRef={searchRef} keyOf={(person) => nomineeKey(person.nominee)}
        isSelected={isSelected} isInert={(person) => full && !isSelected(person)} onChoose={toggle} multiselectable morph="plain"
        render={(person) => <span>{person.name}{person.nominee.kind === "invitation" && <span className={labelStyles.scopeHint}> · Invitation pending</span>}</span>}
        emptyText={needle ? "No matching people" : "Nobody else to ask yet"} />}
      {loading && <p role="status" className={labelStyles.caption}>Loading people…</p>}
      {loadError && <><p role="alert" className={labelStyles.error}>{loadError}</p><Button type="button" size="sm" variant="secondary" onClick={() => void load()}>Retry</Button></>}
      {full && <p role="status" className={labelStyles.caption}>A Request can have at most {MAX_REVIEWERS} reviewers.</p>}
    </PopoverContent>
  </Popover>;
}
