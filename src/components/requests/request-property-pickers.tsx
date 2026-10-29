"use client";

import { callAction } from "@/lib/action-call";
import { thrownMessage } from "@/lib/failure-messages";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { createProject } from "@/app/(app)/intake/project-actions";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import { Alert } from "@/components/arc/alert/alert";
import { useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider";
import { ProjectMarker } from "@/components/projects/project-marker";
import styles from "./request-property-pickers.module.css";
import { rememberRequestPopoverEvent } from "./request-popover-events";
import { Placeholder } from "@/components/loading/placeholder";

/** The workspace's Projects, from the (app) layout's provider (seeded with the page). */
export function useWorkspaceProjects() {
  return useSharedWorkspaceProjects();
}

/* Plan item 2.6: the popover shell the Project picker and the reviewer picker
 * share. An Arc Popover anchored to a secondary Button, an Arc SearchField, and
 * a listbox of ghost option Buttons with roving focus (the APG listbox pattern,
 * decision 8.24): the options use one roving tab stop, the search field's
 * ArrowDown enters the list, Enter chooses the first item, the list wraps at
 * the end and ArrowUp on the first item returns to the search. The content is
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
  const inside = candidates.filter((element) => content.contains(element) && element.getAttribute("role") !== "option");
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const position = active ? inside.indexOf(active) : -1;
  // Tab and Shift+Tab from the search field always leave: the field's clear button is not a stop here (it can
  // still be fading out just after a clear, which would otherwise catch the Tab). From any other stop inside the
  // popover (the Project picker's New Project button, say), the user agent moves to the next inside stop first.
  const fromSearch = active instanceof HTMLInputElement && active.type === "search";
  if (!fromSearch && position >= 0 && inside[position + step]) return;
  const outside = candidates.filter((element) => !content.contains(element));
  const trigger = outside.find((element) => element.getAttribute("aria-controls") === content.id);
  const target = trigger && outside[outside.indexOf(trigger) + step];
  if (!target) return;
  event.preventDefault();
  target.focus();
}

export const pickerPopoverProps = {
  "data-lane-request-property-popover": "",
  onPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => rememberRequestPopoverEvent(event.nativeEvent),
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
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const focusKey = items.some(item => keyOf(item) === activeKey) ? activeKey : items[0] ? keyOf(items[0]) : null;
  return <div role="listbox" aria-label={label} aria-multiselectable={multiselectable || undefined} aria-busy={busy} className={styles.optionList}>
    {items.length ? items.map((item, index) => {
      const selected = isSelected(item);
      const inert = Boolean(isInert?.(item));
      return <Button key={keyOf(item)} ref={(element) => { optionRefs.current[index] = element; }}
        type="button" role="option" aria-selected={selected} tabIndex={keyOf(item) === focusKey ? 0 : -1}
        onFocus={() => setActiveKey(keyOf(item))}
        variant="ghost" size="sm" morph={morph} className={`${styles.option} ${styles.projectOption}`} disabled={disabled} aria-disabled={inert || undefined}
        onClick={() => { if (!inert) onChoose(item); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); optionRefs.current[(index + 1) % items.length]?.focus(); }
          if (event.key === "ArrowUp") { event.preventDefault(); if (index === 0) searchRef.current?.focus(); else optionRefs.current[index - 1]?.focus(); }
        }}>
        <span className={styles.optionContent}>{lead?.(item)}{render(item)}{selected && <Check className={styles.selectionMark} aria-hidden="true" />}</span>
      </Button>;
    }) : emptyText ? <p className={styles.empty}>{emptyText}</p> : null}
  </div>;
}

type ProjectChoice = { id: string | null; name: string; kind: "project" | "none" | "create" };
const noProject: ProjectChoice = { id: null, name: "No project", kind: "none" };

/** Arc Popover with Lane's existing project selection and creation contract. */
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
  const newProjectRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [projectName, setProjectName] = useState("");
  const [naming, setNaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const focusProjectList = useCallback(() => {
    const selectedOption = optionRefs.current.find((option) => option?.getAttribute("aria-selected") === "true");
    (selectedOption ?? optionRefs.current[0] ?? newProjectRef.current)?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    if (naming) nameRef.current?.focus();
    else focusProjectList();
  }, [open, naming, focusProjectList]);
  useEffect(() => {
    if (open && createError && !creating) nameRef.current?.focus();
  }, [open, createError, creating]);
  const normalized = projectName.trim().replace(/\s+/g, " ");
  const selected = state.projects.find((project) => project.id === value);
  const items: ProjectChoice[] = [
    noProject,
    ...state.projects.map((project): ProjectChoice => ({ ...project, kind: "project" })),
  ];


  async function choose(choice: ProjectChoice | null) {
    if (creating) return;
    if (choice?.kind !== "create") {
      onChange(choice?.id ?? null);
      setProjectName(""); setOpen(false); return;
    }
    setCreating(true); onBusyChange(true); setCreateError(null);
    try {
      const result = await callAction(() => createProject({ name: choice.name }, { orgId }));
      if (result.success) {
        state.addProject(result.project);
        onChange(result.project.id);
        setProjectName(""); setOpen(false);
      } else {
        setCreateError(result.error.message);
        if (result.error.code === "conflict") void state.reload();
      }
    } catch (thrown) { setCreateError(thrownMessage(thrown, "Project couldn't be created. Try again; your Request is still here.")); }
    finally {
      setCreating(false); onBusyChange(false);
    }
  }

  return <Popover open={open} onOpenChange={(next) => {
    if (creating) return;
    setOpen(next); if (next) { setProjectName(""); setNaming(false); setCreateError(null); }
  }}>
    <PopoverTrigger asChild>
      <Button type="button" id="intake-project" className={styles.trigger} variant="secondary" size="sm" disabled={disabled} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? "intake-project-error" : undefined} aria-label={selected ? `Project: ${selected.name}` : value ? "Project: unavailable" : "Project"} title={selected?.name}>
        <span className={styles.chipContent}><ProjectMarker projectId={value} /><span className={styles.chipLabel}>{selected?.name ?? (value ? "Project unavailable" : "Project")}</span></span>
      </Button>
    </PopoverTrigger>
    <PopoverContent {...pickerPopoverProps} inert={open ? undefined : true} aria-label="Choose a Project"
      onOpenAutoFocus={(event) => { event.preventDefault(); focusProjectList(); }} className={naming ? styles.formPanel : styles.panel}>
      {naming ? <div className={styles.projectName}>
        <Input ref={nameRef} label="Project name" value={projectName} maxLength={80} disabled={creating} error={createError ?? undefined}
          onChange={(event) => { setProjectName(event.target.value); setCreateError(null); }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (normalized && !creating) void choose({ id: "create", name: normalized, kind: "create" });
            }
          }} />
        <div className={styles.projectActions}>
          <Button type="button" variant="ghost" size="sm" disabled={creating}
            onClick={() => { setNaming(false); setProjectName(""); setCreateError(null); }}>Cancel</Button>
          <Button type="button" size="sm" loading={creating} disabled={!normalized}
            onClick={() => void choose({ id: "create", name: normalized, kind: "create" })}>Create Project</Button>
        </div>
      </div> : <>
      {!state.loading && !state.error && <div role="listbox" aria-label="Project options" className={styles.optionList}>
        {items.map((item, index) => <Button key={item.id ?? "none"} ref={(element) => { optionRefs.current[index] = element; }}
          type="button" role="option" aria-selected={(item.id ?? null) === value}
          variant="ghost" size="sm" className={`${styles.option} ${styles.projectOption}`} disabled={creating}
          onClick={() => void choose(item)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); (optionRefs.current[index + 1] ?? newProjectRef.current)?.focus(); }
            if (event.key === "ArrowUp") { event.preventDefault(); (optionRefs.current[index - 1] ?? newProjectRef.current)?.focus(); }
            if (event.key === "Home") { event.preventDefault(); optionRefs.current[0]?.focus(); }
            if (event.key === "End") { event.preventDefault(); newProjectRef.current?.focus(); }
          }}>
          <span className={styles.optionContent}>
            <ProjectMarker projectId={item.id ?? null} /><span>{item.name}</span>
            {item.id === value && <Check className={styles.selectionMark} aria-hidden="true" />}
          </span>
        </Button>)}
      </div>}
      {state.loading && <Placeholder label="Loading Projects" lines={2} />}
      {state.error && <><Alert title="Projects unavailable" tone="danger">{state.error}</Alert><Button size="sm" variant="secondary" onClick={() => void state.reload()}>Retry Projects</Button></>}
      {createError && <Alert title="Project not created" tone="danger">{createError}</Alert>}
      <div className={styles.newProject}>
        <Button ref={newProjectRef} type="button" variant="ghost" size="sm" className={styles.option} disabled={creating}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "Home") { event.preventDefault(); optionRefs.current[0]?.focus(); }
            if (event.key === "ArrowUp") { event.preventDefault(); optionRefs.current[items.length - 1]?.focus(); }
          }}
          onClick={() => { setNaming(true); setCreateError(null); }}>
          <span className={styles.optionContent}><Plus aria-hidden="true" /><span>New Project</span></span>
        </Button>
      </div>
      </>}
    </PopoverContent>
  </Popover>;
}

export { RequestPriorityPicker } from "./request-priority-picker";
