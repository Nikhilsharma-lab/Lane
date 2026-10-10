"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createProject, listProjects } from "@/app/(app)/intake/project-actions";
import { Check, Layers2, Plus, Rows3 } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover";
import { RadioGroup } from "@/components/arc/radio-group/radio-group";
import { Alert } from "@/components/arc/alert/alert";
import { useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider";
import {
  REQUEST_TYPES, REQUEST_TYPE_DESCRIPTIONS, REQUEST_TYPE_LABELS,
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
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  useEffect(() => {
    if (open && createError && !creating) searchRef.current?.focus();
  }, [open, createError, creating]);
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
    setOpen(next); if (next) { setQuery(""); setCreateError(null); }
  }}>
    <PopoverTrigger asChild>
      <Button type="button" id="intake-project" variant="secondary" size="sm" disabled={disabled} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? "intake-project-error" : undefined} aria-label={selected ? `Project: ${selected.name}` : value ? "Project: unavailable" : "Project"}>
        <Layers2 size={16} aria-hidden="true" />{selected?.name ?? (value ? "Project unavailable" : "Project")}
      </Button>
    </PopoverTrigger>
    <PopoverContent data-lane-request-property-popover aria-label="Choose a Project"
      onOpenAutoFocus={(event) => { event.preventDefault(); searchRef.current?.focus(); }}
      onKeyDown={(event) => event.stopPropagation()} className="space-y-3">
      <SearchField ref={searchRef} label="Project" aria-label="Search Projects" placeholder="Search or create…" disabled={creating} maxLength={80}
        value={query} onValueChange={(next) => { setQuery(next); setCreateError(null); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && items.length) { event.preventDefault(); optionRefs.current[0]?.focus(); }
          if (event.key === "Enter" && items.length) { event.preventDefault(); void choose(items[0]); }
        }} />
      {!state.loading && !state.error && <div role="listbox" aria-label="Project options" className={styles.optionList}>
        {items.length ? items.map((item, index) => <Button key={item.id ?? "none"} ref={(element) => { optionRefs.current[index] = element; }}
          type="button" role="option" aria-selected={item.kind !== "create" && (item.id ?? null) === value}
          variant="ghost" size="sm" className={styles.option} disabled={creating}
          onClick={() => void choose(item)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); optionRefs.current[(index + 1) % items.length]?.focus(); }
            if (event.key === "ArrowUp") { event.preventDefault(); if (index === 0) searchRef.current?.focus(); else optionRefs.current[index - 1]?.focus(); }
          }}>
          {item.kind === "create" ? <Plus size={16} aria-hidden="true" /> : item.id === value ? <Check size={16} aria-hidden="true" /> : <span className={styles.iconSpace} aria-hidden="true" />}
          {item.kind === "create" ? `Create “${item.name}”` : item.name}
        </Button>) : <p className={styles.empty}>No Projects match.</p>}
      </div>}
      {state.loading && <p role="status" className="text-sm text-muted-foreground">Loading Projects…</p>}
      {state.error && <><Alert title="Projects unavailable" tone="danger">{state.error}</Alert><Button size="sm" variant="secondary" onClick={() => void state.reload()}>Retry Projects</Button></>}
      {creating && <p role="status" className="text-sm text-muted-foreground">Creating Project…</p>}
      {createError && <Alert title="Project not created" tone="danger">{createError}</Alert>}
      {!state.loading && !state.error && state.projects.length === 0 && !normalized && <p className="text-sm text-muted-foreground">Type a name to create your first Project.</p>}
    </PopoverContent>
  </Popover>;
}

const typeOptions: { value: RequestType | null; label: string; description: string }[] = [
  { value: null, label: "No type", description: "You can leave this undecided." },
  ...REQUEST_TYPES.map((value) => ({ value, label: REQUEST_TYPE_LABELS[value], description: REQUEST_TYPE_DESCRIPTIONS[value] })),
];

export function RequestTypePicker({ value, onChange, disabled, error }: {
  value: RequestType | null; onChange: (value: RequestType | null) => void; disabled: boolean; error?: string;
}) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button type="button" id="intake-request-type" variant="secondary" size="sm" disabled={disabled} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? "intake-request-type-error" : undefined} aria-label={value ? `Request type: ${REQUEST_TYPE_LABELS[value]}` : "Request type"}>
      <Rows3 size={16} aria-hidden="true" />{value ? REQUEST_TYPE_LABELS[value] : "Request type"}
    </Button></PopoverTrigger>
    <PopoverContent data-lane-request-property-popover aria-label="Choose a Request type" onKeyDown={(event) => event.stopPropagation()}>
      <RadioGroup label="Request type" name="request-type" options={typeOptions.map(option => ({ ...option, value: option.value ?? "none" }))} value={value ?? "none"} onValueChange={next => { onChange(next === "none" ? null : next as RequestType); setOpen(false); }} />
    </PopoverContent>
  </Popover>;
}
