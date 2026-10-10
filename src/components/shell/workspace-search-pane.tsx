"use client";
// Arc Pro source (https://uiarc.dev): adapted from licensed Arc Pro search-results, used under the
// Arc Pro license as part of the Lane app. Not covered by any license of this repository; not for reuse outside Lane.

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { Search, SearchX, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { motionTokens } from "@/components/arc/lib/motion-tokens";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { statuses } from "@/components/requests/tasks/statuses";
import dotStyles from "@/components/projects/project-dot.module.css";
import { projectToneForId } from "@/lib/project-tone";
import { formatRequestCode } from "@/lib/request-code";
import { requestDetailHref, requestListHref } from "@/lib/request-workspace";
import {
  WORKSPACE_SEARCH_QUERY_MAX,
  type WorkspaceSearchInput,
  type WorkspaceSearchResponse,
} from "@/lib/workspace-search";
import styles from "./workspace-search-pane.module.css";
import { SidebarExpandButton } from "./sidebar-controls";

export type WorkspaceSearchPaneProps = {
  active?: boolean;
  onSearch: (input: WorkspaceSearchInput) => Promise<WorkspaceSearchResponse>;
  onClose: () => void;
  onNavigate?: (href: string) => void;
};

type SearchData = Extract<WorkspaceSearchResponse, { success: true }>;
type Category = "all" | "requests" | "projects";
type Operation = "search" | Exclude<Category, "all">;
type Failure = { message: string; input: WorkspaceSearchInput; operation: Operation };

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return text;
  const source = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts = [];
  let cursor = 0;
  let index = source.indexOf(needle);
  while (index !== -1) {
    parts.push(<Fragment key={index}>{text.slice(cursor, index)}<mark className={styles.mark}>{text.slice(index, index + query.length)}</mark></Fragment>);
    cursor = index + query.length;
    index = source.indexOf(needle, cursor);
  }
  return <>{parts}{text.slice(cursor)}</>;
}

function appendUnique<T extends { id: string }>(previous: T[], incoming: T[]) {
  return [...new Map([...previous, ...incoming].map(item => [item.id, item])).values()];
}

/** Licensed Arc Pro search-results query/result structure, adapted for Lane's
 * authenticated server search and existing routes. No sample-data search,
 * simulated latency, facet sidebar or preview/detail panel is retained. */
export function WorkspaceSearchPane({ active = true, onSearch, onClose, onNavigate }: WorkspaceSearchPaneProps) {
  const uid = useId();
  const reduced = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const sequence = useRef(0);
  const pendingFocus = useRef<{ sequence: number; trigger: HTMLButtonElement; resultId?: string } | null>(null);
  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState<Category>("all");
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
    return () => { sequence.current += 1; };
  }, [active]);
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || pending.sequence !== sequence.current || pending.trigger.isConnected) return;
    if (document.activeElement !== document.body && document.activeElement !== pending.trigger) { pendingFocus.current = null; return; }
    const target = pending.resultId && rootRef.current?.querySelector<HTMLAnchorElement>(`[data-search-result="${CSS.escape(pending.resultId)}"]`);
    (target || inputRef.current)?.focus();
    pendingFocus.current = null;
  }, [data, loading]);

  const normalized = draft.trim();
  const current = data?.query === normalized ? data : null;
  const currentFailure = failure?.input.query === normalized ? failure : null;
  const total = current ? category === "all" ? current.requests.total + current.projects.total : current[category].total : 0;

  function edit(value: string) {
    sequence.current += 1;
    setDraft(value); setLoading(null); setFailure(null);
    if (!value.trim()) setData(null);
  }
  function clear() { edit(""); inputRef.current?.focus(); }
  function close() { sequence.current += 1; setLoading(null); onClose(); }

  async function run(input: WorkspaceSearchInput, operation: Operation = "search") {
    if (!input.query.trim()) { clear(); return; }
    const id = ++sequence.current;
    const trigger = document.activeElement;
    if (trigger instanceof HTMLButtonElement && trigger.dataset.searchRetry !== undefined) inputRef.current?.focus();
    setLoading(operation); setFailure(null);
    if (operation === "search") setData(null);
    try {
      const response = await onSearch(input);
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
      if (id === sequence.current) setLoading(null);
    }
  }
  function loadMore(kind: Exclude<Category, "all">) {
    if (!current || loading) return;
    return run({ query: current.query, requestsPage: current.requests.page + (kind === "requests" ? 1 : 0), projectsPage: current.projects.page + (kind === "projects" ? 1 : 0) }, kind);
  }
  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    onNavigate?.(href);
  }
  const options = (["all", "requests", "projects"] as const).map(value => ({
    value,
    label: value === "all" ? "All" : value === "requests" ? "Requests" : "Projects",
    accessory: current ? <span className={styles.count}>{value === "all" ? current.requests.total + current.projects.total : current[value].total}</span> : undefined,
  }));
  const announced = loading === "search" ? `Searching for ${normalized}` : current ? `${total} ${total === 1 ? "result" : "results"} for ${current.query}` : "";

  return <section ref={rootRef} className={styles.root} hidden={!active} aria-label="Workspace search" onKeyDown={event => {
    if (active && event.key === "Escape" && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <h1 className={styles.srOnly}>Workspace search</h1>
    <header className={styles.top}>
      <SidebarExpandButton />
      <form role="search" className={styles.query} onSubmit={event => { event.preventDefault(); void run({ query: normalized, requestsPage: 0, projectsPage: 0 }); }}>
        <Search className={styles.queryIcon} size={20} strokeWidth={1.75} aria-hidden="true" />
        <label htmlFor={`${uid}-query`} className={styles.srOnly}>Search workspace</label>
        <input ref={inputRef} id={`${uid}-query`} className={styles.queryInput} type="search" inputMode="search" enterKeyHint="search" autoComplete="off" spellCheck={false}
          placeholder="Search Requests and Projects" maxLength={WORKSPACE_SEARCH_QUERY_MAX} value={draft} onChange={event => edit(event.target.value)} />
        {draft ? <Button type="button" variant="ghost" className={styles.action} aria-label="Clear search" onClick={clear}>Clear</Button> : null}
      </form>
      <Button type="button" variant="ghost" className={styles.close} aria-label="Close search" title="Close search" onClick={close}><X size={20} strokeWidth={1.75} aria-hidden="true" /></Button>
    </header>
    <div className={styles.categories}><SegmentedControl label="Search category" className={styles.categoryControl} options={options} value={category} onValueChange={value => setCategory(value as Category)} /></div>
    <p role="status" className={styles.srOnly}>{announced}</p>
    <section aria-label="Search results" aria-busy={loading !== null} className={styles.results}>
      {currentFailure ? <div className={styles.error}><Alert tone="danger" title="Search unavailable">{currentFailure.message}</Alert><Button variant="secondary" className={styles.action} data-search-retry="" onClick={() => run(currentFailure.input, currentFailure.operation)}>Retry search</Button></div> : null}
      {loading === "search" ? <div className={styles.loading}>{[0, 1, 2, 3].map(index => <Skeleton key={index} label="Searching workspace" className={styles.skeletonRow} lines={2} />)}</div>
        : current && total > 0 ? <>
          <p className={styles.summary}>{total} {total === 1 ? "result" : "results"}</p>
          <motion.div className={styles.groups} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : motionTokens.duration.standard, ease: [...motionTokens.ease.enter] }}>
            {(category === "all" || category === "requests") && current.requests.total > 0 ? <section aria-label="Requests results" className={styles.group}>
              <h2 className={styles.groupTitle}>Requests <span className={styles.count}>{current.requests.total}</span></h2>
              <ul className={styles.list}>{current.requests.items.map(item => {
                const status = statuses.find(status => status.value === item.status)!;
                const Icon = status.icon;
                const href = requestDetailHref(item.id, "all");
                return <li key={item.id}><Link href={href} className={styles.result} data-search-result={item.id} onClick={event => navigate(event, href)}>
                  <span className={styles.lead}><Icon size={20} strokeWidth={1.75} aria-hidden="true" /></span>
                  <span className={styles.content}>
                    <span className={styles.title}><Highlight text={item.title} query={current.query} /></span>
                    {item.reframedProblem && item.reframedProblem !== item.title ? <span className={styles.snippet}><Highlight text={item.reframedProblem} query={current.query} /></span> : null}
                    <span className={styles.metadata}>{item.requestNumber === undefined ? null : <span><Highlight text={formatRequestCode(item.requestNumber)} query={current.query} /></span>}<Badge size="sm" tone={status.tone}>{status.label}</Badge>{item.projectName ? <span className={styles.project}><span className={dotStyles.dot} data-tone={projectToneForId(item.projectId ?? "none")} aria-hidden="true" /><span>{item.projectName}</span></span> : null}<time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time></span>
                  </span>
                </Link></li>;
              })}</ul>
              {current.requests.hasMore ? <Button variant="ghost" className={`${styles.more} ${styles.action}`} loading={loading === "requests"} disabled={loading !== null} data-load-more="requests" onClick={() => loadMore("requests")}>Load more Requests</Button> : null}
            </section> : null}
            {(category === "all" || category === "projects") && current.projects.total > 0 ? <section aria-label="Projects results" className={styles.group}>
              <h2 className={styles.groupTitle}>Projects <span className={styles.count}>{current.projects.total}</span></h2>
              <ul className={styles.list}>{current.projects.items.map(item => {
                const href = requestListHref("all", item.id);
                return <li key={item.id}><Link href={href} className={styles.result} data-search-result={item.id} onClick={event => navigate(event, href)}>
                  <span className={styles.lead}><span className={dotStyles.dot} data-tone={projectToneForId(item.id)} aria-hidden="true" /></span>
                  <span className={styles.content}><span className={styles.title}><Highlight text={item.name} query={current.query} /></span>{item.description ? <span className={styles.snippet}><Highlight text={item.description} query={current.query} /></span> : null}</span>
                </Link></li>;
              })}</ul>
              {current.projects.hasMore ? <Button variant="ghost" className={`${styles.more} ${styles.action}`} loading={loading === "projects"} disabled={loading !== null} data-load-more="projects" onClick={() => loadMore("projects")}>Load more Projects</Button> : null}
            </section> : null}
          </motion.div>
        </> : !currentFailure ? <div className={styles.empty}><EmptyState
          icon={current ? <SearchX size={24} strokeWidth={1.75} /> : <Search size={24} strokeWidth={1.75} />}
          title={current ? "No results found" : "Search your workspace"}
          description={current ? "Try another word or check the spelling." : "Find Requests and Projects. Type a search and press Enter."}
        /></div> : null}
    </section>
  </section>;
}
