"use client";
// Adapted from licensed Arc Pro search-results (https://uiarc.dev).
// Arc Pro source is licensed for Lane, not for redistribution outside this app.

import { Fragment, useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { CalendarDays, Clock, Link2, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { BottomSheet } from "@/components/arc/bottom-sheet/bottom-sheet";
import { Button } from "@/components/arc/button/button";
import buttonStyles from "@/components/arc/button/button.module.css";
import { Checkbox } from "@/components/arc/checkbox/checkbox";
import { DateRangePicker, preloadDateRangePicker, type DateRange } from "@/components/date-range-picker-lazy";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { FilterToolbar, type FilterChip } from "@/components/arc/filter-toolbar/filter-toolbar";
import { motionTokens } from "@/components/arc/lib/motion-tokens";
import { SearchField } from "@/components/arc/search-field/search-field";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { CopyButton } from "@/components/requests/copy-button";
import { RequestLabels, LabelDot } from "@/components/requests/request-labels";
import { useWorkspaceLabels } from "@/components/requests/workspace-labels";
import { ProjectMarker } from "@/components/projects/project-marker";
import { statuses } from "@/components/requests/tasks/statuses";
import { formatRequestCode } from "@/lib/request-code";
import { requestDetailHref, requestListHref } from "@/lib/request-workspace";
import type { SearchSort, WorkspaceSearchFilters, WorkspaceSearchProject, WorkspaceSearchRequest, WorkspaceSearchResponse } from "@/lib/workspace-search";
import { SidebarExpandButton } from "./sidebar-controls";
import styles from "./workspace-search-pane.module.css";

type Data = Extract<WorkspaceSearchResponse, { success: true }>;
type Category = "all" | "requests" | "projects";
type Match = { kind: "request"; item: WorkspaceSearchRequest } | { kind: "project"; item: WorkspaceSearchProject };
function useLabelOptions() { const {labels}=useWorkspaceLabels(); return [...labels.map(label=>({value:label.id,label:label.name,colour:label.colour})),{value:"none",label:"No labels",colour:"grey" as const}]; }
const SORTS = [{ value: "relevance", label: "Best match" }, { value: "newest", label: "Newest" }, { value: "title", label: "A to Z" }];
const titleOf = (result: Match) => result.kind === "request" ? result.item.title : result.item.name;
const hrefOf = (result: Match) => result.kind === "request" ? requestDetailHref(result.item.id, "all") : requestListHref("all", result.item.id);
const dateLabel = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Arc's per-term marks, escaped so literal punctuation remains safe. */
function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return text;
  return <>{text.split(new RegExp(`(${terms.join("|")})`, "gi")).map((part, index) => index % 2 ? <mark key={index} className={styles.mark}>{part}</mark> : <Fragment key={index}>{part}</Fragment>)}</>;
}

/** The licensed block's count movement follows the direction of a real result change. */
function CountRoll({ value }: { value: number }) {
  const reduced = useReducedMotion();
  const [state, setState] = useState({ value, direction: 1 });
  if (state.value !== value) setState({ value, direction: value > state.value ? 1 : -1 });
  return <span className={styles.roll}><AnimatePresence mode="popLayout" initial={false} custom={state.direction}>
    <motion.span key={value} custom={state.direction} variants={{ enter: (d: number) => ({ y: reduced ? 0 : `${d * .7}em`, opacity: 0 }), center: { y: 0, opacity: 1 }, exit: (d: number) => ({ y: reduced ? 0 : `${d * -.7}em`, opacity: 0 }) }} initial="enter" animate="center" exit="exit" transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}>{value}</motion.span>
  </AnimatePresence></span>;
}

function Preview({ result, query, onNavigate }: { result: Match; query: string; onNavigate?: (href: string) => void }) {
  const item = result.item;
  const status = result.kind === "request" ? statuses.find(status => status.value === result.item.status)! : null;
  return <article className={styles.previewCard} aria-label={`Preview of ${titleOf(result)}`}>
    <div className={styles.previewHead}><Lead result={result} /><div><h2 className={styles.previewTitle}><Highlight text={titleOf(result)} query={query} /></h2><p className={styles.previewMeta}>{result.kind === "request" ? result.item.requestNumber === undefined ? "Request" : formatRequestCode(result.item.requestNumber) : "Project"}</p></div></div>
    <div className={styles.previewBody}>
      {item.description || result.kind === "request" && result.item.reframedProblem ? <p><Highlight text={item.description || (result.kind === "request" ? result.item.reframedProblem ?? "" : "")} query={query} /></p> : null}
    </div>
    <dl className={styles.facts}>
      {status ? <div><dt>Status</dt><dd><Badge tone={status.tone} size="sm">{status.label}</Badge></dd></div> : null}
      {result.kind === "request" ? <><div><dt>Project</dt><dd>{result.item.projectName ?? "No Project"}</dd></div><div><dt>Labels</dt><dd><RequestLabels request={result.item} /></dd></div></> : null}
      {item.createdAt ? <div><dt>Created</dt><dd><time dateTime={item.createdAt}>{dateLabel(item.createdAt)}</time></dd></div> : null}
    </dl>
    <div className={styles.previewActions}>
      <Link href={hrefOf(result)} className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.sm}`} onClick={event => { if (!event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) onNavigate?.(hrefOf(result)); }}>Open {result.kind === "request" ? "Request" : "Project"}</Link>
      <CopyButton label="Copy link" copied="Link copied." value={() => new URL(hrefOf(result), window.location.origin).href} icon={<Link2 aria-hidden="true" />} />
    </div>
  </article>;
}

function Lead({ result }: { result: Match }) {
  if (result.kind === "project") return <span className={styles.lead}><ProjectMarker projectId={result.item.id} /></span>;
  const status = statuses.find(status => status.value === result.item.status)!;
  const Icon = status.icon;
  return <Icon className={styles.lead} data-status={result.item.status} aria-hidden="true" />;
}

function Facets({ data, filters, category, onCategory, onChange, onDates }: { data: Data | null; filters: WorkspaceSearchFilters; category: Category; onCategory: (category: Category) => void; onChange: (filters: WorkspaceSearchFilters) => void; onDates: () => void }) {
  const TYPES=useLabelOptions();
  return <div className={styles.facets}>
    <fieldset className={styles.facetGroup}><legend>Search in</legend>
      {(["all", "requests", "projects"] as const).map(value => <div className={styles.option} key={value}><Checkbox label={value === "all" ? "All" : value === "requests" ? "Requests" : "Projects"} checked={category === value} onCheckedChange={() => onCategory(value)} /><span className={styles.optionCount}>{data ? value === "all" ? data.requests.total + data.projects.total : data[value].total : ""}</span></div>)}
    </fieldset>
    <fieldset className={styles.facetGroup}><legend>Request status</legend>
      {statuses.map(status => { const on = filters.statuses?.includes(status.value) ?? false; const count = data?.facets ? data.facets.statuses[status.value] ?? 0 : undefined; return <div className={styles.option} key={status.value}><Checkbox label={status.label} checked={on} disabled={count === 0 && !on} onCheckedChange={checked => onChange({ ...filters, statuses: checked ? [...(filters.statuses ?? []), status.value] : filters.statuses?.filter(value => value !== status.value) })} /><span className={styles.optionCount}>{count ?? ""}</span></div>; })}
    </fieldset>
    <fieldset className={styles.facetGroup}><legend>Labels</legend>
      {TYPES.map(type => { const on = filters.types?.includes(type.value) ?? false; const count = data?.facets ? data.facets.types[type.value] ?? 0 : undefined; return <div className={styles.option} key={type.value}><LabelDot colour={type.colour}/><Checkbox label={type.label} checked={on} disabled={count === 0 && !on} onCheckedChange={checked => onChange({ ...filters, types: checked ? [...(filters.types ?? []), type.value] : filters.types?.filter(value => value !== type.value) })} /><span className={styles.optionCount}>{count ?? ""}</span></div>; })}
    </fieldset>
    <div className={styles.facetGroup}><span className={styles.legend}>Created</span><Button variant="secondary" size="sm" onClick={onDates} onPointerEnter={preloadDateRangePicker} onFocus={preloadDateRangePicker}><CalendarDays aria-hidden="true" />{filters.createdFrom ? "Change dates" : "Any time"}</Button>{filters.createdFrom ? <span className={styles.hint}>{dateLabel(filters.createdFrom)} to {dateLabel(filters.createdTo!)}</span> : null}</div>
  </div>;
}

type Props = {
  active: boolean; rootRef: RefObject<HTMLElement | null>; inputRef: RefObject<HTMLInputElement | null>;
  draft: string; data: Data | null; loading: "search" | "requests" | "projects" | null; failure?: string;
  filters: WorkspaceSearchFilters; sort: SearchSort; maxLength: number;
  onEdit: (value: string) => void; onSubmit: (query?: string) => Promise<void>; onClose: () => void;
  onLoadMore: (category: "requests" | "projects") => void; onRetry: () => unknown;
  onFiltersChange: (filters: WorkspaceSearchFilters) => void; onSortChange: (sort: SearchSort) => void; onNavigate?: (href: string) => void;
};

export function WorkspaceSearchResults({ active, rootRef, inputRef, draft, data, loading, failure, filters, sort, maxLength, onEdit, onSubmit, onClose, onLoadMore, onRetry, onFiltersChange, onSortChange, onNavigate }: Props) {
  const TYPES=useLabelOptions();
  const uid = useId();
  const reduced = useReducedMotion();
  const dateTrigger = useRef<HTMLElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const [category, setCategory] = useState<Category>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuIndex, setMenuIndex] = useState(-1);
  const lastQuery = useRef("");
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) { setPreviewOpen(false); setFiltersOpen(false); setDatesOpen(false); setMenuOpen(false); }
  }
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 1120));
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);
  useEffect(() => {
    if (!data?.query || data.query === lastQuery.current) return;
    lastQuery.current = data.query;
    setRecent(previous => [data.query, ...previous.filter(query => query.toLowerCase() !== data.query.toLowerCase())].slice(0, 5));
  }, [data]);

  const matches: Match[] = data ? [...(category !== "projects" ? data.requests.items.map(item => ({ kind: "request" as const, item })) : []), ...(category !== "requests" ? data.projects.items.map(item => ({ kind: "project" as const, item })) : [])] : [];
  const selected = matches.find(result => result.item.id === activeId) ?? matches[0] ?? null;
  const selectedIndex = selected ? matches.indexOf(selected) : -1;
  const total = data ? category === "all" ? data.requests.total + data.projects.total : data[category].total : 0;
  const suggestions = recent.filter(query => query.toLowerCase().includes(draft.trim().toLowerCase()) && query.toLowerCase() !== draft.trim().toLowerCase());
  const showMenu = menuOpen && suggestions.length > 0;
  const chips: FilterChip[] = [
    ...(category === "all" ? [] : [{ id: "category", label: "Search in", value: category === "requests" ? "Requests" : "Projects" }]),
    ...(filters.statuses ?? []).map(value => ({ id: `status:${value}`, label: "Status", value: statuses.find(status => status.value === value)!.label })),
    ...(filters.types ?? []).map(value => ({ id: `type:${value}`, label: "Labels", value: TYPES.find(type => type.value === value)?.label ?? "Saved label" })),
    ...(filters.createdFrom ? [{ id: "dates", label: "Created", value: `${dateLabel(filters.createdFrom)} to ${dateLabel(filters.createdTo!)}` }] : []),
  ];
  const filterCount = chips.length;
  const resultKey = `${data?.query ?? ""}|${sort}|${chips.map(chip => chip.id + chip.value).join(",")}`;
  const fade = { duration: reduced ? 0 : motionTokens.duration.standard, ease: [...motionTokens.ease.enter] as [number, number, number, number] };
  const range: DateRange | null = filters.createdFrom && filters.createdTo ? { start: new Date(`${filters.createdFrom}T00:00:00`), end: new Date(`${filters.createdTo}T00:00:00`) } : null;

  function applyFilters(next: WorkspaceSearchFilters) { setActiveId(null); onFiltersChange(next); }
  function clearFilters() { setCategory("all"); applyFilters({}); }
  function removeChip(id: string) {
    if (id === "category") return setCategory("all");
    if (id === "dates") return applyFilters({ ...filters, createdFrom: undefined, createdTo: undefined });
    const [kind, value] = id.split(":");
    applyFilters(kind === "status" ? { ...filters, statuses: filters.statuses?.filter(item => item !== value) } : { ...filters, types: filters.types?.filter(item => item !== value) });
  }
  function submit(query = draft.trim()) { setMenuOpen(false); setMenuIndex(-1); setActiveId(null); scrollRef.current?.scrollTo({ top: 0 }); void onSubmit(query); }
  function openPreview(result: Match) { setActiveId(result.item.id); listRef.current?.focus({ preventScroll: true }); if (!wide) setPreviewOpen(true); }
  function moveTo(index: number) { const result = matches[Math.max(0, Math.min(matches.length - 1, index))]; if (!result) return; setActiveId(result.item.id); document.getElementById(`${uid}-${result.item.id}`)?.scrollIntoView({ block: "nearest" }); }
  function inputKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") { event.preventDefault(); if (showMenu) setMenuIndex(index => (index + 1) % suggestions.length); else if (matches.length) listRef.current?.focus(); }
    else if (event.key === "ArrowUp" && showMenu) { event.preventDefault(); setMenuIndex(index => index <= 0 ? suggestions.length - 1 : index - 1); }
    else if (event.key === "Enter") { event.preventDefault(); submit(showMenu && menuIndex >= 0 ? suggestions[menuIndex] : draft.trim()); }
    else if (event.key === "Escape" && showMenu) { event.preventDefault(); event.stopPropagation(); setMenuOpen(false); }
  }
  function listKey(event: KeyboardEvent<HTMLUListElement>) {
    if (event.key === "ArrowDown" || event.key === "j") { event.preventDefault(); moveTo(selectedIndex + 1); }
    else if (event.key === "ArrowUp" || event.key === "k") { event.preventDefault(); if (selectedIndex <= 0) inputRef.current?.focus(); else moveTo(selectedIndex - 1); }
    else if (event.key === "Home" || event.key === "End") { event.preventDefault(); moveTo(event.key === "Home" ? 0 : matches.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (selected) openPreview(selected); }
    else if (event.key === "Escape" || event.key === "/") { event.preventDefault(); event.stopPropagation(); inputRef.current?.focus(); }
  }
  const facetProps = { data, filters, category, onCategory: (value: Category) => { setCategory(value); setActiveId(null); }, onChange: applyFilters, onDates: () => { dateTrigger.current = document.activeElement as HTMLElement; setDatesOpen(true); } };

  return <section ref={rootRef} className={styles.root} hidden={!active} aria-label="Workspace search" onKeyDown={event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || previewOpen || filtersOpen || datesOpen) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    if (event.key === "/" && !(event.target instanceof HTMLInputElement)) { event.preventDefault(); inputRef.current?.focus(); }
  }}>
    <h1 className={styles.srOnly}>Workspace search</h1>
    <header className={styles.top}><SidebarExpandButton />
      <div className={styles.queryWrap}><form role="search" onSubmit={event => { event.preventDefault(); submit(); }}>
        <SearchField ref={inputRef} label="Search workspace" hideLabel role="combobox" aria-autocomplete="list" aria-expanded={showMenu} aria-controls={showMenu ? `${uid}-suggestions` : undefined} aria-activedescendant={showMenu && menuIndex >= 0 ? `${uid}-suggestion-${menuIndex}` : undefined}
          placeholder="Search Requests and Projects" value={draft} maxLength={maxLength} autoComplete="off" spellCheck={false} onValueChange={value => { onEdit(value); setMenuIndex(-1); setMenuOpen(true); }} onKeyDown={inputKey} onFocus={() => setMenuOpen(true)} onBlur={() => setMenuOpen(false)} />
      </form>
      <AnimatePresence>{showMenu ? <motion.div className={styles.menu} initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}>
        <span className={styles.menuLabel}>Recent searches</span><ul id={`${uid}-suggestions`} role="listbox" aria-label="Recent searches">{suggestions.map((query, index) => <li key={query} id={`${uid}-suggestion-${index}`} role="option" aria-selected={index === menuIndex} className={styles.menuRow} onMouseDown={event => event.preventDefault()} onMouseMove={() => setMenuIndex(index)} onClick={() => submit(query)}><Clock aria-hidden="true" /><span><Highlight text={query} query={draft} /></span></li>)}</ul>
      </motion.div> : null}</AnimatePresence></div>
      <BottomSheet title="Search filters" open={filtersOpen && active} onOpenChange={setFiltersOpen} detents={[.9]} trigger={<Button variant="secondary" size="sm" className={styles.mobileFilters}><SlidersHorizontal aria-hidden="true" />Filters{filterCount ? ` (${filterCount})` : ""}</Button>}><Facets {...facetProps} /><div className={styles.sheetFooter}><Button variant="secondary" size="sm" onClick={clearFilters} disabled={!filterCount}>Clear filters</Button><Button size="sm" onClick={() => setFiltersOpen(false)}>Show results</Button></div></BottomSheet>
      <Button variant="ghost" size="sm" aria-label="Close search" onClick={onClose}><X aria-hidden="true" /></Button>
    </header>
    <div className={styles.body}>
      <aside className={styles.sidebar} aria-label="Search filters"><div className={styles.facetsHead}><h2>Filters</h2>{filterCount ? <Button variant="ghost" size="sm" onClick={clearFilters}>Clear all</Button> : null}</div><Facets {...facetProps} /></aside>
      <section ref={scrollRef} aria-label="Search results" aria-busy={loading !== null} className={styles.results}>
        <div className={styles.mainHead}><p className={styles.summary}>{loading === "search" ? "Searching" : data ? <><CountRoll value={total} /> {total === 1 ? "result" : "results"}</> : "Search your workspace"}</p><SegmentedControl label="Sort results" options={SORTS} value={sort} onValueChange={value => onSortChange(value as SearchSort)} /></div>
        <p role="status" className={styles.srOnly}>{loading === "search" ? `Searching for ${draft}` : data ? `${total} results for ${data.query}` : ""}</p>
        <AnimatePresence initial={false}>{chips.length ? <motion.div className={styles.chipsFrame} initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={reduced ? { duration: 0 } : motionTokens.spring.smooth}><FilterToolbar filters={chips} onRemove={removeChip} onClearAll={clearFilters} announce={false} /></motion.div> : null}</AnimatePresence>
        {failure ? <div className={styles.error}><Alert tone="danger" title="Search unavailable">{failure}</Alert><Button variant="secondary" size="sm" data-search-retry="" onClick={() => { onRetry(); }}>Retry search</Button></div> : null}
        {loading === "search" ? <div className={styles.loading}>{[0, 1, 2, 3].map(index => <Skeleton key={index} label="Searching workspace" className={styles.skeletonRow} lines={3} />)}</div>
          : matches.length ? <motion.div key={resultKey} className={styles.groups} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={fade}>
            <LayoutGroup id={`${uid}-cursor-${resultKey}`}><ul ref={listRef} className={styles.list} role="listbox" tabIndex={0} aria-label="Search matches" aria-activedescendant={selected ? `${uid}-${selected.item.id}` : undefined} onKeyDown={listKey}>
              {matches.map(result => <li key={`${result.kind}-${result.item.id}`} id={`${uid}-${result.item.id}`} role="option" tabIndex={-1} aria-selected={selected?.item.id === result.item.id} data-search-result={result.item.id} className={styles.result} onFocus={event => { if (event.target === event.currentTarget) setActiveId(result.item.id); }} onClick={() => openPreview(result)}>
                {selected?.item.id === result.item.id ? <motion.span layoutId="cursor" className={styles.cursor} aria-hidden="true" transition={reduced ? { duration: 0 } : motionTokens.spring.smooth} /> : null}
                <Lead result={result} /><span className={styles.content}><span className={styles.title}><Highlight text={titleOf(result)} query={data!.query} /></span>
                <span className={styles.metadata}>{result.kind === "request" ? <>{result.item.requestNumber === undefined ? "Request" : <Highlight text={formatRequestCode(result.item.requestNumber)} query={data!.query} />}<span>·</span>{statuses.find(status => status.value === result.item.status)!.label}<span>·</span>{result.item.projectName ?? "No Project"}</> : "Project"}</span>
                {result.item.description || result.kind === "request" && result.item.reframedProblem ? <span className={styles.snippet}><Highlight text={result.item.description || (result.kind === "request" ? result.item.reframedProblem ?? "" : "")} query={data!.query} /></span> : null}
                {result.item.createdAt ? <time className={styles.metadata} dateTime={result.item.createdAt}>{dateLabel(result.item.createdAt)}</time> : null}</span>
              </li>)}
            </ul></LayoutGroup>
            <div className={styles.more}>{(["requests", "projects"] as const).map(kind => category !== (kind === "requests" ? "projects" : "requests") && data?.[kind].hasMore ? <Button key={kind} variant="ghost" size="sm" disabled={loading !== null} loading={loading === kind} data-load-more={kind} onClick={() => onLoadMore(kind)}>Load more {kind === "requests" ? "Requests" : "Projects"}</Button> : null)}</div>
            <p className={styles.keys} aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd> move <kbd>↵</kbd> preview <kbd>/</kbd> search</p>
          </motion.div> : !failure ? <div className={styles.empty}><EmptyState icon={data ? <SearchX data-icon-size="2xl" /> : <Search data-icon-size="2xl" />} title={data ? "No results found" : "Find a Request or Project"} description={data ? "Try another word or check the spelling." : "Search by Request code, title or description."} action={filterCount ? <Button size="sm" variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined} /></div> : null}
      </section>
      <aside className={styles.preview} aria-label="Result preview"><AnimatePresence mode="wait" initial={false}>{selected && !loading ? <motion.div key={selected.item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}><Preview result={selected} query={data!.query} onNavigate={onNavigate} /></motion.div> : <p className={styles.previewEmpty}>{loading ? "Searching" : "Select a result to preview it."}</p>}</AnimatePresence></aside>
    </div>
    <BottomSheet title="Result preview" open={previewOpen && active} onOpenChange={setPreviewOpen} onCloseAutoFocus={event => { event.preventDefault(); if (active) listRef.current?.focus(); }} detents={[.9]}>{selected ? <Preview result={selected} query={data!.query} onNavigate={onNavigate} /> : null}</BottomSheet>
    <Dialog open={datesOpen && active} onOpenChange={setDatesOpen}><DialogContent title="Created date" className={styles.dateDialog} overlayClassName={styles.dateOverlay} onCloseAutoFocus={event => { event.preventDefault(); if (active) dateTrigger.current?.focus(); }}><DateRangePicker embedded value={range} label="Created date range" months={1} onCancel={() => setDatesOpen(false)} onChange={value => { applyFilters({ ...filters, createdFrom: dayKey(value.start), createdTo: dayKey(value.end) }); setDatesOpen(false); }} /></DialogContent></Dialog>
  </section>;
}
