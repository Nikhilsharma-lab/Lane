"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createProject, listProjects } from "@/app/(app)/intake/project-actions";
import { Check, Layers2, Plus, Rows3 } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import { Select } from "@/components/arc/select/select";
import { Alert } from "@/components/arc/alert/alert";
import { useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider";
import {
  REQUEST_TYPES, REQUEST_TYPE_LABELS,
  type ProjectOption, type RequestType,
} from "@/lib/request-constants";
import styles from "./request-property-pickers.module.css";

export function useWorkspaceProjects(orgId: string, active: boolean) {
  const workspaceProjects = useSharedWorkspaceProjects();
  const shared = workspaceProjects?.orgId === orgId ? workspaceProjects : null;
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await listProjects({ orgId });
      if (!mounted.current) return;
      if (result.success) { setProjects(result.projects); loaded.current = true; }
      else setError(result.error.message);
    } catch {
      if (mounted.current) setError("Projects could not load. Your Request can still be reviewed.");
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [orgId]);
  useEffect(() => { if (!shared && active && !loaded.current) void reload(); }, [active, reload, shared]);
  const addProject = (project: ProjectOption) => setProjects((current) =>
    [...current.filter((item) => item.id !== project.id), project].sort((a, b) => a.name.localeCompare(b.name)));
  return shared ?? { projects, loading, error, reload, addProject };
}

/* Plan item 2.6: the popover shell the Project picker and the reviewer picker
 * share. An Arc Popover anchored to a secondary Button, an Arc SearchField, and
 * a listbox of ghost option Buttons with a roving tabindex (the APG listbox,
 * as the list's keyboard model in decision 8.24): the list is one tab stop,
 * the search field's ArrowDown enters it, Enter chooses the first item, the
 * list wraps at the end and ArrowUp on the first item returns to the search;
 * Tab and Shift+Tab leave the popover from its trigger. The content is
 * portalled, so a React keydown inside it still bubbles to the form that owns
 * the picker: stopPropagation keeps Esc for the popover (Radix closes it from
 * its own document listener) instead of cancelling the whole form. */
export type OptionRefs = RefObject<(HTMLButtonElement | null)[]>;

const TABBABLE = 'a[href], button, input, select, textarea, [tabindex]';
const tabbable = (element: HTMLElement) => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest('[aria-hidden="true"]') && element.getClientRects().length > 0;

/** Tab and Shift+Tab leave the popover from its trigger, so focus lands on the next (or previous) control of the form that owns
 *  the picker. The content is portalled to the end of the document, so the user agent alone would walk off the page from the
 *  last control inside; the move out dismisses the popover (Radix non-modal), which keeps focus where it landed. */
function leaveFromTrigger(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
  const content = event.currentTarget;
  const step = event.shiftKey ? -1 : 1;
  const candidates = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter(tabbable);
  const inside = candidates.filter((element) => content.contains(element));
  const position = document.activeElement instanceof HTMLElement ? inside.indexOf(document.activeElement) : -1;
  // The next stop is still inside the popover (the search field's clear button, the list's one stop, the Project picker's
  // New Project button): the user agent moves there.
  if (position >= 0 && inside[position + step]) return;
  const outside = candidates.filter((element) => !content.contains(element));
  const trigger = outside.find((element) => element.getAttribute("aria-controls") === content.id);
  const target = trigger && outside[outside.indexOf(trigger) + step];
  if (!target) return;
  event.preventDefault();
  target.focus();
}

export const pickerPopoverProps = {
  "data-lane-request-property-popover": "",
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => { leaveFromTrigger(event); event.stopPropagation(); },
} as const;

/** `onOpenAutoFocus`: the search field takes focus instead of the popover panel. */
export function focusOnOpen(event: Event, ref: RefObject<HTMLElement | null>) { event.preventDefault(); ref.current?.focus(); }

/** The search field's keys: ArrowDown focuses the first option; Enter chooses the first item. */
export function searchListKeyDown<T>(event: KeyboardEvent<HTMLInputElement>, items: T[], optionRefs: OptionRefs, onEnter: (first: T) => void) {
  if (event.key === "ArrowDown" && items.length) { event.preventDefault(); optionRefs.current[0]?.focus(); }
  if (event.key === "Enter" && items.length) { event.preventDefault(); onEnter(items[0]); }
}

export function PickerOptions<T>({ items, label, optionRefs, searchRef, keyOf, isSelected, isInert, lead, render, onChoose, disabled, emptyText, busy, multiselectable, morph }: {
  items: T[];
  label: string;
  optionRefs: OptionRefs;
  searchRef: RefObject<HTMLInputElement | null>;
  keyOf: (item: T) => string;
  isSelected: (item: T) => boolean;
  /** Dimmed (the stylesheet's aria-disabled rule) and ignores presses, but keeps its place in the roving focus (a full multi-select). */
  isInert?: (item: T) => boolean;
  /** A lead glyph for an item that is neither the check nor the spacer. */
  lead?: (item: T) => ReactNode;
  render: (item: T) => ReactNode;
  onChoose: (item: T) => void;
  disabled?: boolean;
  emptyText?: string;
  busy?: boolean;
  multiselectable?: boolean;
  /** "plain" for a list that stays open while rows toggle (dense rows swap their check without a blur, decision 8.22). */
  morph?: "blur" | "plain";
}) {
  // Roving tabindex (the APG listbox): the list is one tab stop, carried by the option focused last, else the first row.
  // Arc's Button would otherwise make every row a stop (tabIndex ?? 0); rows at -1 alone would leave the scrolling list
  // with no stop at all, which axe's scrollable-region-focusable rule (the Storybook a11y gate) refuses.
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const currentIndex = Math.max(0, items.findIndex((item) => keyOf(item) === currentKey));
  return <div role="listbox" aria-label={label} aria-multiselectable={multiselectable || undefined} aria-busy={busy} className={styles.optionList}>
    {items.length ? items.map((item, index) => {
      const selected = isSelected(item);
      const inert = Boolean(isInert?.(item));
      return <Button key={keyOf(item)} ref={(element) => { optionRefs.current[index] = element; }}
        type="button" role="option" aria-selected={selected} tabIndex={index === currentIndex ? 0 : -1}
        variant="ghost" size="sm" morph={morph} className={styles.option} disabled={disabled} aria-disabled={inert || undefined}
        onFocus={() => setCurrentKey(keyOf(item))}
        onClick={() => { if (!inert) onChoose(item); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); optionRefs.current[(index + 1) % items.length]?.focus(); }
          if (event.key === "ArrowUp") { event.preventDefault(); if (index === 0) searchRef.current?.focus(); else optionRefs.current[index - 1]?.focus(); }
        }}>
        {lead?.(item) ?? (selected ? <Check size={16} aria-hidden="true" /> : <span className={styles.iconSpace} aria-hidden="true" />)}
        {render(item)}
      </Button>;
    }) : emptyText ? <p className={styles.empty}>{emptyText}</p> : null}
  </div>;
}

type ProjectChoice = { id: string | null; name: string; kind: "project" | "none" | "create" };
const noProject: ProjectChoice = { id: null, name: "No project", kind: "none" };

/** Arc Popover and Combobox with Lane's existing project creation contract. */
export function ProjectPicker({ orgId, value, onChange, disabled, state, onBusyChange, error }: {
  orgId: string;
  value: string | null;
  onChange: (value: string | null) => void;
  disabled: boolean;
  error?: string;
  onBusyChange: (busy: boolean) => void;
  state: ReturnType<typeof useWorkspaceProjects>;
}) {
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  useEffect(() => {
    if (open) (naming ? nameRef : searchRef).current?.focus();
  }, [open, naming]);
  useEffect(() => {
    if (open && createError && !creating) (naming ? nameRef : searchRef).current?.focus();
  }, [open, createError, creating, naming]);
  const normalized = query.trim().replace(/\s+/g, " ");
  const selected = state.projects.find((project) => project.id === value);
  const matches = state.projects.filter((project) => project.name.toLocaleLowerCase().includes(normalized.toLocaleLowerCase()));
  const exactMatch = state.projects.some((project) => project.name.toLocaleLowerCase() === normalized.toLocaleLowerCase());
  const items: ProjectChoice[] = [
    ...(!normalized ? [noProject] : []),
    ...matches.map((project): ProjectChoice => ({ ...project, kind: "project" })),
    ...(normalized && !exactMatch && !state.loading && !state.error ? [{ id: "create", name: normalized, kind: "create" as const }] : []),
  ];


  async function choose(choice: ProjectChoice | null) {
    if (creating) return;
    if (choice?.kind !== "create") {
      onChange(choice?.id ?? null);
      setQuery(""); setOpen(false); return;
    }
    setCreating(true); onBusyChange(true); setCreateError(null);
    try {
      const result = await createProject({ name: choice.name }, { orgId });
      if (result.success) {
        state.addProject(result.project);
        onChange(result.project.id);
        setQuery(""); setOpen(false);
      } else {
        setCreateError(result.error.message);
        if (result.error.code === "conflict") void state.reload();
      }
    } catch { setCreateError("Project could not be created. Try again; your Request is still here."); }
    finally {
      setCreating(false); onBusyChange(false);
    }
  }

  return <Popover open={open} onOpenChange={(next) => {
    if (creating) return;
    setOpen(next); if (next) { setQuery(""); setNaming(false); setCreateError(null); }
  }}>
    <PopoverTrigger asChild>
      <Button type="button" id="intake-project" variant="secondary" size="sm" disabled={disabled} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? "intake-project-error" : undefined} aria-label={selected ? `Project: ${selected.name}` : value ? "Project: unavailable" : "Project"}>
        <Layers2 size={16} aria-hidden="true" />{selected?.name ?? (value ? "Project unavailable" : "Project")}
      </Button>
    </PopoverTrigger>
    <PopoverContent {...pickerPopoverProps} aria-label="Choose a Project" onOpenAutoFocus={(event) => focusOnOpen(event, searchRef)} className="space-y-3">
      {naming ? <div className={styles.projectName}>
        <Input ref={nameRef} label="Project name" value={query} maxLength={80} disabled={creating} error={createError ?? undefined}
          onChange={(event) => { setQuery(event.target.value); setCreateError(null); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (normalized && !creating) void choose({ id: "create", name: normalized, kind: "create" });
            }
          }} />
        <div className={styles.projectActions}>
          <Button type="button" variant="ghost" size="sm" disabled={creating}
            onClick={() => { setNaming(false); setQuery(""); setCreateError(null); }}>Cancel</Button>
          <Button type="button" size="sm" disabled={creating || !normalized}
            onClick={() => void choose({ id: "create", name: normalized, kind: "create" })}>Create Project</Button>
        </div>
      </div> : <>
      <SearchField ref={searchRef} label="Project" aria-label="Search Projects" placeholder="Search or create…" disabled={creating} maxLength={80}
        value={query} onValueChange={(next) => { setQuery(next); setCreateError(null); }}
        onKeyDown={(event) => searchListKeyDown(event, items, optionRefs, (first) => { void choose(first); })} />
      {!state.loading && !state.error && <PickerOptions items={items} label="Project options" optionRefs={optionRefs} searchRef={searchRef}
        keyOf={(item) => item.id ?? "none"}
        isSelected={(item) => item.kind !== "create" && (item.id ?? null) === value}
        lead={(item) => item.kind === "create" ? <Plus size={16} aria-hidden="true" /> : undefined}
        render={(item) => item.kind === "create" ? `Create “${item.name}”` : item.name}
        onChoose={(item) => { void choose(item); }} disabled={creating} emptyText="No Projects match." />}
      {state.loading && <p role="status" className="text-sm text-muted-foreground">Loading Projects…</p>}
      {state.error && <><Alert title="Projects unavailable" tone="danger">{state.error}</Alert><Button size="sm" variant="secondary" onClick={() => void state.reload()}>Retry Projects</Button></>}
      {createError && <Alert title="Project not created" tone="danger">{createError}</Alert>}
      {!state.loading && !state.error && state.projects.length === 0 && !normalized && <p className="text-sm text-muted-foreground">Type a name to create your first Project.</p>}
      <div className={styles.newProject}>
        <Button type="button" variant="ghost" size="sm" className={styles.option} disabled={creating}
          onClick={() => { setNaming(true); setCreateError(null); }}>
          <Plus size={16} aria-hidden="true" />New Project
        </Button>
      </div>
      </>}
      {creating && <p role="status" className="text-sm text-muted-foreground">Creating Project…</p>}
    </PopoverContent>
  </Popover>;
}

const typeOptions = [
  { value: "none", label: "No type" },
  ...REQUEST_TYPES.map((value) => ({ value, label: REQUEST_TYPE_LABELS[value] })),
];

export function RequestTypePicker({ value, onChange, disabled, error }: {
  value: RequestType | null; onChange: (value: RequestType | null) => void; disabled: boolean; error?: string;
}) {
  return <Select label="Request type" id="intake-request-type" options={typeOptions} value={value ?? "none"} disabled={disabled}
    onValueChange={(next) => onChange(next === "none" ? null : next as RequestType)}
    onContentKeyDown={(event) => event.stopPropagation()}
    trigger={<Button type="button" variant="secondary" size="sm" disabled={disabled} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? "intake-request-type-error" : undefined} aria-label={value ? `Request type: ${REQUEST_TYPE_LABELS[value]}` : "Request type"}>
      <Rows3 size={16} aria-hidden="true" />{value ? REQUEST_TYPE_LABELS[value] : "Request type"}
    </Button>} />;
}
