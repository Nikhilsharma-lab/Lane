"use client";
// Arc Pro source (https://uiarc.dev): adapted from licensed Arc Pro search-results, used under the
// Arc Pro license as part of the Lane app. Not covered by any license of this repository; not for reuse outside Lane.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRequestNavigation } from "@/components/requests/request-navigation";
import { parseRequestCode } from "@/lib/request-code";
import { requestDetailHref } from "@/lib/request-workspace";
import {
  WORKSPACE_SEARCH_QUERY_MAX, keepShownOrder, localDayRange, requestWithCode, searchLoaded,
  type LocalSearchSource, type SearchSort, type WorkspaceSearchFilters, type WorkspaceSearchInput, type WorkspaceSearchResponse,
} from "@/lib/workspace-search";
import { WorkspaceSearchResults } from "./workspace-search-results";

export type WorkspaceSearchPaneProps = {
  active?: boolean;
  /** Resolves one search. The signal aborts it when a newer query replaces it (plan item 1.16). */
  onSearch: (input: WorkspaceSearchInput, signal?: AbortSignal) => Promise<WorkspaceSearchResponse>;
  onClose: () => void;
  /** A plain click on a result's link is about to navigate. */
  onNavigate?: (href: string) => void;
  /** Opens a result without a link: Enter on an exact saved code, or Cmd or Ctrl+Enter on a result (plan item 2.8). Defaults to onNavigate and a client navigation. */
  onOpen?: (href: string) => void;
  /** The Requests and Projects already in the browser, read on each keystroke for instant local matches. Never re-renders the pane. */
  getLoaded?: () => LocalSearchSource;
  /** Fixtures only: the zone for shown dates and the created-date filter. Defaults to the viewer's. */
  timeZone?: string;
};

/** Typing pauses this long before a search is sent; Enter searches at once. */
export const SEARCH_DEBOUNCE_MS = 150;

// Kept importable from here for existing callers; the shell imports the small module directly (plan item 2.8).
export { fetchWorkspaceSearch } from "./workspace-search-fetch";

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

const firstPage = <T,>(items: T[]) => ({ items, total: items.length, page: 0, hasMore: false });

/**
 * Async controller for the licensed Arc Search Results presentation.
 *
 * Plan item 2.8: while a person types, the list shows, in this order: the
 * server's results for the current query; instant matches among the loaded
 * Requests and Projects; or the last results, kept. Never an empty state or a
 * skeleton between keystrokes. The list is aria-busy only while a request is in flight.
 */
export function WorkspaceSearchPane({ active = true, onSearch, onClose, onNavigate, onOpen, getLoaded, timeZone }: WorkspaceSearchPaneProps) {
  const navigation = useRequestNavigation();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const sequence = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const debounce = useRef(0);
  const [draft, setDraft] = useState("");
  const [filters, setFilters] = useState<WorkspaceSearchFilters>({});
  const [sort, setSort] = useState<SearchSort>("relevance");
  const [server, setServer] = useState<SearchData | null>(null);
  const [local, setLocal] = useState<SearchData | null>(null);
  // What the list showed before the latest keystroke, kept until something for the new query arrives.
  const [kept, setKept] = useState<SearchData | null>(null);
  // The local matches on screen, read when the server answers so those rows keep their places.
  const shownLocal = useRef<SearchData | null>(null);
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

  const normalized = draft.trim();
  const settled = server?.query === normalized ? server : null;
  const instant = !settled && local?.query === normalized && (local.requests.items.length || local.projects.items.length) ? local : null;
  const shown = settled ?? instant ?? kept;
  useLayoutEffect(() => { shownLocal.current = instant; }, [instant]);
  const currentFailure = failure?.input.query === normalized ? failure : null;

  function cancel() {
    sequence.current += 1;
    window.clearTimeout(debounce.current);
    inflight.current?.abort(); inflight.current = null;
  }
  function matchLoaded(query: string): SearchData | null {
    const source = getLoaded?.();
    if (!source || !query) return null;
    const matches = searchLoaded(source, { ...wireFilters(filters, timeZone), sort, query });
    return { success: true, query, requests: firstPage(matches.requests), projects: firstPage(matches.projects) };
  }
  function edit(value: string) {
    cancel();
    setDraft(value); setLoading(null); setFailure(null);
    const query = value.trim();
    if (!query) { setServer(null); setLocal(null); setKept(null); return; }
    // Plan item 2.8: matches among the loaded Requests and Projects show in this
    // render; the server's answer follows a short pause, replacing any older
    // request still in flight. Until either has something, the last results stay.
    setLocal(matchLoaded(query));
    setKept(shown);
    debounce.current = window.setTimeout(() => { void run({ ...wireFilters(filters, timeZone), sort, query, requestsPage: 0, projectsPage: 0 }); }, SEARCH_DEBOUNCE_MS);
  }
  function close() { cancel(); setLoading(null); onClose(); }
  function open(href: string) {
    cancel(); setLoading(null);
    if (onOpen) onOpen(href);
    else { navigation.open(href); onNavigate?.(href); }
  }

  async function run(input: WorkspaceSearchInput, operation: Operation = "search", openCode = false) {
    if (!input.query.trim()) { edit(""); inputRef.current?.focus(); return; }
    cancel();
    const id = sequence.current;
    const navigationStillCurrent = navigation.continuation();
    const controller = new AbortController();
    inflight.current = controller;
    const trigger = document.activeElement;
    if (trigger instanceof HTMLButtonElement && trigger.dataset.searchRetry !== undefined) inputRef.current?.focus();
    setLoading(operation); setFailure(null);
    try {
      const response = await onSearch(input, controller.signal);
      if (id !== sequence.current) return;
      if (!response.success) { setFailure({ message: response.error.message, input, operation }); return; }
      if (operation === "search") {
        // Rows already on screen from the local matches stay where they are, except for an exact
        // saved code: the Request it names ranks first (decision 1), even when only the server has it.
        const before = shownLocal.current?.query === response.query && parseRequestCode(response.query) === null ? shownLocal.current : null;
        const next = before ? {
          ...response,
          requests: keepShownOrder(before.requests.items.map(item => item.id), response.requests),
          projects: keepShownOrder(before.projects.items.map(item => item.id), response.projects),
        } : response;
        setServer(next); setKept(next);
        const target = openCode ? requestWithCode(response.query, response.requests.items) : null;
        if (target && navigationStillCurrent()) open(requestDetailHref(target.id, "all"));
        return;
      }
      setServer(previous => {
        if (previous?.query !== response.query) return response;
        return operation === "requests"
          ? { ...previous, requests: { ...response.requests, items: appendUnique(previous.requests.items, response.requests.items) } }
          : { ...previous, projects: { ...response.projects, items: appendUnique(previous.projects.items, response.projects.items) } };
      });
    } catch {
      if (id === sequence.current) setFailure({ message: "Search could not be completed. Try again.", input, operation });
    } finally {
      if (id === sequence.current) { setLoading(null); if (inflight.current === controller) inflight.current = null; }
    }
  }
  function loadMore(kind: Exclude<Category, "all">) {
    if (!settled || loading) return;
    return run({ ...wireFilters(filters, timeZone), sort, query: settled.query, requestsPage: settled.requests.page + (kind === "requests" ? 1 : 0), projectsPage: settled.projects.page + (kind === "projects" ? 1 : 0) }, kind);
  }
  function changeFilters(next: WorkspaceSearchFilters) {
    setFilters(next);
    if (!normalized) return;
    // Local matches were for the old filters; the server's order decides from here.
    setLocal(null);
    void run({ ...wireFilters(next, timeZone), sort, query: normalized, requestsPage: 0, projectsPage: 0 });
  }
  function changeSort(next: SearchSort) {
    setSort(next);
    if (!normalized) return;
    setLocal(null);
    void run({ ...wireFilters(filters, timeZone), sort: next, query: normalized, requestsPage: 0, projectsPage: 0 });
  }
  /**
   * Enter in the field (decision 1, 2026-10-20): an exact saved code opens that
   * Request; any other query searches at once. A code no loaded Request has is
   * searched, and its Request opens when the server finds it.
   */
  function submit(query = normalized) {
    const known = requestWithCode(query, getLoaded?.().requests, server?.requests.items);
    if (known) { setDraft(query); open(requestDetailHref(known.id, "all")); return Promise.resolve(); }
    if (query !== normalized) { setDraft(query); setLocal(matchLoaded(query)); setKept(shown); }
    return run({ ...wireFilters(filters, timeZone), sort, query, requestsPage: 0, projectsPage: 0 }, "search", parseRequestCode(query) !== null);
  }
  return <WorkspaceSearchResults active={active} rootRef={rootRef} inputRef={inputRef}
    draft={draft} data={shown} facets={server} settled={settled !== null} loading={loading} failure={currentFailure?.message}
    filters={filters} sort={sort} maxLength={WORKSPACE_SEARCH_QUERY_MAX} timeZone={timeZone}
    onEdit={edit} onSubmit={submit} onClose={close} onLoadMore={loadMore} onOpen={open}
    onRetry={() => currentFailure && run(currentFailure.input, currentFailure.operation)}
    onFiltersChange={changeFilters} onSortChange={changeSort} onNavigate={open} />;
}
