"use client";
// Arc Pro source (https://uiarc.dev): adapted from licensed Arc Pro search-results, used under the
// Arc Pro license as part of the Lane app. Not covered by any license of this repository; not for reuse outside Lane.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { WORKSPACE_SEARCH_QUERY_MAX, localDayRange, type WorkspaceSearchInput, type WorkspaceSearchResponse, type WorkspaceSearchFilters, type SearchSort } from "@/lib/workspace-search";
import { WorkspaceSearchResults } from "./workspace-search-results";

export type WorkspaceSearchPaneProps = {
  active?: boolean;
  /** Resolves one search. The signal aborts it when a newer query replaces it (plan item 1.16). */
  onSearch: (input: WorkspaceSearchInput, signal?: AbortSignal) => Promise<WorkspaceSearchResponse>;
  onClose: () => void;
  onNavigate?: (href: string) => void;
};

/** Typing pauses this long before a search is sent; Enter searches at once. */
export const SEARCH_DEBOUNCE_MS = 150;

const sessionExpired: WorkspaceSearchResponse = { success: false, error: { code: "session_expired", message: "Your workspace session changed. Refresh the page to search again." } };
const searchFailed: WorkspaceSearchResponse = { success: false, error: { code: "search_failed", message: "Search could not be completed. Try again." } };

/**
 * Plan item 1.16 (decision 8.15): search reads GET /api/search instead of a
 * server action, so typing never queues behind a pending mutation and a
 * stale request is aborted instead of finishing first. Status codes map to
 * the same response shape the action returned.
 */
export function fetchWorkspaceSearch(orgId: string) {
  return async (input: WorkspaceSearchInput, signal?: AbortSignal): Promise<WorkspaceSearchResponse> => {
    const params = new URLSearchParams({ org: orgId, q: input.query });
    if (input.requestsPage) params.set("requestsPage", String(input.requestsPage));
    if (input.projectsPage) params.set("projectsPage", String(input.projectsPage));
    if (input.statuses?.length) params.set("statuses", input.statuses.join(","));
    if (input.types?.length) params.set("types", input.types.join(","));
    if (input.sort) params.set("sort", input.sort);
    if (input.createdSince) params.set("createdSince", input.createdSince);
    if (input.createdBefore) params.set("createdBefore", input.createdBefore);
    const response = await fetch(`/api/search?${params}`, { signal, headers: { accept: "application/json" }, credentials: "same-origin" });
    if (response.status === 401 || response.status === 403) return sessionExpired;
    const body = await response.json().catch(() => null) as WorkspaceSearchResponse | null;
    if (!body || typeof body !== "object" || !("success" in body)) return searchFailed;
    return body;
  };
}

type SearchData = Extract<WorkspaceSearchResponse, { success: true }>;
type Category = "all" | "requests" | "projects";
type Operation = "search" | Exclude<Category, "all">;
type Failure = { message: string; input: WorkspaceSearchInput; operation: Operation };

/** The pane's filters as GET /api/search takes them: created dates become the viewer's local day boundaries (plan item 2.8). */
function wireFilters({ createdFrom, createdTo, ...filters }: WorkspaceSearchFilters, timeZone?: string) {
  return createdFrom && createdTo ? { ...filters, ...localDayRange(createdFrom, createdTo, timeZone) } : filters;
}

function appendUnique<T extends { id: string }>(previous: T[], incoming: T[]) {
  return [...new Map([...previous, ...incoming].map(item => [item.id, item])).values()];
}

/** Async controller for the licensed Arc Search Results presentation. */
export function WorkspaceSearchPane({ active = true, onSearch, onClose, onNavigate }: WorkspaceSearchPaneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const sequence = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const debounce = useRef(0);
  const pendingFocus = useRef<{ sequence: number; trigger: HTMLButtonElement; resultId?: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<WorkspaceSearchFilters>({});
  const [sort, setSort] = useState<SearchSort>("relevance");
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState<Operation | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [wasActive, setWasActive] = useState(active);

  // A hidden pane keeps completed results, not a stranded pending state. This
  // conditional prop adjustment occurs before descendants render the new state.
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) { setLoading(null); setFailure(null); }
  }
  useEffect(() => {
    if (active) inputRef.current?.focus();
    // A response from before close or unmount must never populate a later view.
    return () => { sequence.current += 1; window.clearTimeout(debounce.current); inflight.current?.abort(); inflight.current = null; };
  }, [active]);
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || pending.sequence !== sequence.current || pending.trigger.isConnected) return;
    if (document.activeElement !== document.body && document.activeElement !== pending.trigger) { pendingFocus.current = null; return; }
    const target = pending.resultId && rootRef.current?.querySelector<HTMLElement>(`[data-search-result="${CSS.escape(pending.resultId)}"]`);
    (target || inputRef.current)?.focus();
    pendingFocus.current = null;
  }, [data, loading]);

  const normalized = draft.trim();
  const current = data?.query === normalized ? data : null;
  const currentFailure = failure?.input.query === normalized ? failure : null;

  function cancel() {
    sequence.current += 1;
    window.clearTimeout(debounce.current);
    inflight.current?.abort(); inflight.current = null;
  }
  function edit(value: string) {
    cancel();
    setDraft(value); setLoading(null); setFailure(null);
    const query = value.trim();
    if (!query) { setData(null); return; }
    // Search as you type: a short pause, then one request that replaces any
    // older one still in flight.
    debounce.current = window.setTimeout(() => { void run({ ...wireFilters(filters), sort, query, requestsPage: 0, projectsPage: 0 }); }, SEARCH_DEBOUNCE_MS);
  }
  function clear() { edit(""); inputRef.current?.focus(); }
  function close() { cancel(); setLoading(null); onClose(); }

  async function run(input: WorkspaceSearchInput, operation: Operation = "search") {
    if (!input.query.trim()) { clear(); return; }
    cancel();
    const id = sequence.current;
    const controller = new AbortController();
    inflight.current = controller;
    const trigger = document.activeElement;
    if (trigger instanceof HTMLButtonElement && trigger.dataset.searchRetry !== undefined) inputRef.current?.focus();
    setLoading(operation); setFailure(null);
    if (operation === "search") setData(null);
    try {
      const response = await onSearch(input, controller.signal);
      if (id !== sequence.current) return;
      if (!response.success) { setFailure({ message: response.error.message, input, operation }); return; }
      setData(previous => {
        if (operation === "search" || previous?.query !== response.query) return response;
        return operation === "requests"
          ? { ...previous, requests: { ...response.requests, items: appendUnique(previous.requests.items, response.requests.items) } }
          : { ...previous, projects: { ...response.projects, items: appendUnique(previous.projects.items, response.projects.items) } };
      });
      // If the last-page button disappears under keyboard focus, hand focus to
      // the first new result. Other interactions keep their current focus.
      if (operation !== "search" && !response[operation].hasMore && trigger instanceof HTMLButtonElement && trigger.dataset.loadMore === operation
        && (document.activeElement === trigger || document.activeElement === document.body)) {
        pendingFocus.current = { sequence: id, trigger, resultId: response[operation].items[0]?.id };
      }
    } catch {
      if (id === sequence.current) setFailure({ message: "Search could not be completed. Try again.", input, operation });
    } finally {
      if (id === sequence.current) { setLoading(null); if (inflight.current === controller) inflight.current = null; }
    }
  }
  function loadMore(kind: Exclude<Category, "all">) {
    if (!current || loading) return;
    return run({ ...wireFilters(filters), sort, query: current.query, requestsPage: current.requests.page + (kind === "requests" ? 1 : 0), projectsPage: current.projects.page + (kind === "projects" ? 1 : 0) }, kind);
  }
  function changeFilters(next: WorkspaceSearchFilters) {
    setFilters(next);
    if (normalized) void run({ ...wireFilters(next), sort, query: normalized, requestsPage: 0, projectsPage: 0 });
  }
  function changeSort(next: SearchSort) {
    setSort(next);
    if (normalized) void run({ ...wireFilters(filters), sort: next, query: normalized, requestsPage: 0, projectsPage: 0 });
  }
  function submit(query = normalized) {
    setDraft(query);
    return run({ ...wireFilters(filters), sort, query, requestsPage: 0, projectsPage: 0 });
  }
  return <WorkspaceSearchResults active={active} rootRef={rootRef} inputRef={inputRef}
    draft={draft} data={current} loading={loading} failure={currentFailure?.message}
    filters={filters} sort={sort} maxLength={WORKSPACE_SEARCH_QUERY_MAX}
    onEdit={edit} onSubmit={submit} onClose={close} onLoadMore={loadMore}
    onRetry={() => currentFailure && run(currentFailure.input, currentFailure.operation)}
    onFiltersChange={changeFilters} onSortChange={changeSort} onNavigate={onNavigate} />;
}
