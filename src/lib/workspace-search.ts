import { parseRequestCode } from "./request-code";

export const WORKSPACE_SEARCH_PAGE_SIZE = 20;
export const WORKSPACE_SEARCH_QUERY_MAX = 200;

export type SearchStatus = "open" | "in_progress" | "done";
export type SearchRequestType = "bug" | "improvement" | "new_feature" | "none";
export type SearchSort = "relevance" | "newest" | "title";
/** The filters the pane shows. Created dates are the viewer's calendar days, both inclusive. */
export type WorkspaceSearchFilters = {
  statuses?: SearchStatus[];
  types?: SearchRequestType[];
  createdFrom?: string;
  createdTo?: string;
};

/**
 * One search as GET /api/search receives it. Plan item 2.8: the created-date
 * filter travels as the instants the viewer's local days start and end
 * (`createdSince` inclusive, `createdBefore` exclusive), so the server filters
 * by the viewer's days, never by UTC days.
 */
export type WorkspaceSearchInput = Pick<WorkspaceSearchFilters, "statuses" | "types"> & {
  query: string;
  requestsPage?: number;
  projectsPage?: number;
  sort?: SearchSort;
  createdSince?: string;
  createdBefore?: string;
};

export type WorkspaceSearchPage<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
  page: number;
};

export type WorkspaceSearchRequest = {
  id: string;
  /** Saved workspace-local number. Optional only for older illustrative fixtures. */
  requestNumber?: number;
  title: string;
  reframedProblem: string | null;
  description?: string;
  status: "open" | "in_progress" | "done";
  projectId: string | null;
  projectName: string | null;
  requestType: "bug" | "improvement" | "new_feature" | null;
  createdAt: string;
};

export type WorkspaceSearchProject = {
  id: string;
  name: string;
  description: string | null;
  createdAt?: string;
};

export type WorkspaceSearchResponse = {
  success: true;
  query: string;
  requests: WorkspaceSearchPage<WorkspaceSearchRequest>;
  projects: WorkspaceSearchPage<WorkspaceSearchProject>;
  facets?: { statuses: Partial<Record<SearchStatus, number>>; types: Partial<Record<SearchRequestType, number>> };
} | {
  success: false;
  error: { code: "session_expired" | "validation" | "search_failed"; message: string };
};

// ---------------------------------------------------------------------------
// Local days (plan item 2.8, decision 4)

/** The viewer's IANA zone, for example "Asia/Kolkata". */
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** How far a zone's wall clock is ahead of UTC at an instant, in milliseconds. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(item => item.type === type)?.value);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wall - Math.floor(instant / 1000) * 1000;
}

function dayParts(day: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new RangeError("Expected a calendar day as YYYY-MM-DD");
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** The instant a calendar day starts in a zone. A second pass settles days that cross a daylight-saving change. */
export function startOfZonedDay(day: string, timeZone: string): Date {
  const [year, month, date] = dayParts(day);
  const midnight = Date.UTC(year, month - 1, date);
  const first = midnight - zoneOffset(midnight, timeZone);
  return new Date(midnight - zoneOffset(first, timeZone));
}

function nextDay(day: string): string {
  const [year, month, date] = dayParts(day);
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

/** The created-date filter for GET /api/search: from the start of `from` to the end of `to`, both the viewer's days. */
export function localDayRange(from: string, to: string, timeZone = viewerTimeZone()): { createdSince: string; createdBefore: string } {
  return { createdSince: startOfZonedDay(from, timeZone).toISOString(), createdBefore: startOfZonedDay(nextDay(to), timeZone).toISOString() };
}

// ---------------------------------------------------------------------------
// Instant local matches (plan item 2.8)

/** Requests and Projects the browser already holds: the loaded Requests list and the sidebar's Projects. */
export type LocalSearchSource = { requests: readonly WorkspaceSearchRequest[]; projects: readonly WorkspaceSearchProject[] };
export type LocalSearchInput = Omit<WorkspaceSearchInput, "requestsPage" | "projectsPage">;

const lower = (value: string | null | undefined) => (value ?? "").toLocaleLowerCase();

/** The server's "Best match" rank (src/lib/data/search.ts): an exact saved code, then an exact title, then a title that contains the words. */
function requestRank(request: WorkspaceSearchRequest, term: string, code: number | null) {
  if (code !== null && request.requestNumber === code) return 3;
  if (lower(request.title) === term) return 2;
  return lower(request.title).includes(term) ? 1 : 0;
}

function projectRank(project: WorkspaceSearchProject, term: string) {
  if (lower(project.name) === term) return 2;
  return lower(project.name).includes(term) ? 1 : 0;
}

const newestFirst = (a: { createdAt?: string; id: string }, b: { createdAt?: string; id: string }) =>
  (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id);

function inRange(createdAt: string | undefined, input: LocalSearchInput) {
  if (!input.createdSince && !input.createdBefore) return true;
  if (!createdAt) return false;
  const at = Date.parse(createdAt);
  return (!input.createdSince || at >= Date.parse(input.createdSince)) && (!input.createdBefore || at < Date.parse(input.createdBefore));
}

/**
 * Matches the loaded Requests by saved code and title (and the reframed
 * problem the list shows as the title), and the loaded Projects by name, with
 * the same filters and order the server uses. Server results replace these;
 * they only fill the time before the first response.
 */
export function searchLoaded(source: LocalSearchSource, input: LocalSearchInput): { requests: WorkspaceSearchRequest[]; projects: WorkspaceSearchProject[] } {
  const term = lower(input.query.trim());
  if (!term) return { requests: [], projects: [] };
  const code = parseRequestCode(term);
  const requests = source.requests.filter(request => (code !== null && request.requestNumber === code)
    || lower(request.title).includes(term) || lower(request.reframedProblem).includes(term))
    .filter(request => !input.statuses?.length || input.statuses.includes(request.status))
    .filter(request => !input.types?.length || input.types.includes(request.requestType ?? "none"))
    .filter(request => inRange(request.createdAt, input));
  const projects = input.statuses?.length || input.types?.length ? [] : source.projects
    .filter(project => lower(project.name).includes(term))
    .filter(project => inRange(project.createdAt, input));
  const byName = (a: WorkspaceSearchProject, b: WorkspaceSearchProject) => lower(a.name).localeCompare(lower(b.name)) || a.id.localeCompare(b.id);
  if (input.sort === "title") {
    requests.sort((a, b) => lower(a.title).localeCompare(lower(b.title)) || a.id.localeCompare(b.id));
    projects.sort(byName);
  } else if (input.sort === "newest") {
    requests.sort(newestFirst);
    projects.sort(newestFirst);
  } else {
    requests.sort((a, b) => requestRank(b, term, code) - requestRank(a, term, code) || newestFirst(a, b));
    projects.sort((a, b) => projectRank(b, term) - projectRank(a, term) || byName(a, b));
  }
  return { requests, projects };
}

/**
 * Server results replace the local matches without moving the rows already on
 * screen: the shown rows the server also returned keep their order at the top,
 * and the server's other rows follow in its order. Shown rows the server did not
 * return leave.
 */
export function keepShownOrder<T extends { id: string }>(shown: readonly string[], page: WorkspaceSearchPage<T>): WorkspaceSearchPage<T> {
  if (!shown.length) return page;
  const byId = new Map(page.items.map(item => [item.id, item]));
  const kept = shown.filter(id => byId.has(id));
  if (!kept.length) return page;
  const keptIds = new Set(kept);
  return { ...page, items: [...kept.map(id => byId.get(id)!), ...page.items.filter(item => !keptIds.has(item.id))] };
}

/** The Request a typed saved code names, among loaded Requests or a server page. */
export function requestWithCode(query: string, ...sources: readonly (readonly WorkspaceSearchRequest[] | undefined)[]): WorkspaceSearchRequest | null {
  const code = parseRequestCode(query);
  if (code === null) return null;
  for (const source of sources) {
    const match = source?.find(request => request.requestNumber === code);
    if (match) return match;
  }
  return null;
}
