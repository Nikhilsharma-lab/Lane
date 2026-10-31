/**
 * #265: where a signed-in page's server time goes. One record per render (or per read-route call) times the same
 * named steps on every page. It holds only the route pattern, step names and durations: never an id, name, email,
 * title or workspace, so neither the Server-Timing header nor the log line can carry anyone's data.
 */

/** The route patterns Lane times. A closed list, so no address with an id in it can become a route name. */
export type RoutePattern =
  | "Requests list"
  | "Request page"
  | "Inbox"
  | "Intake"
  | "Impact"
  | "Settings: Profile"
  | "Settings: Members"
  | "Settings: Metrics"
  | "Settings: a Metric"
  | "Request preview"
  | "Attachment download";

/**
 * The named steps, in the order they're reported. `session` checks the Clerk session, `workspace` finds the
 * profile and workspace, `shell` is the app frame's own reads (Projects, labels, saved views), `data` is the page's
 * own reads and `clerk` is any call to Clerk's servers.
 */
export const TIMING_STEPS = ["session", "workspace", "shell", "data", "clerk"] as const;
export type TimingStep = (typeof TIMING_STEPS)[number];

/**
 * Set by the proxy on each request it passes on: a random value that ties a render's timings to its response, so
 * the response's first byte can carry them. It identifies nothing but that one request.
 */
export const TIMING_ID_HEADER = "x-lane-timing-id";
/** The same for a route handler's call under /api, which times itself rather than as a page render. */
export const READ_TIMING_ID_HEADER = "x-lane-read-timing-id";

type Interval = { start: number; end: number };

/** A full page load, a page change inside Lane (the router's request), a prefetch, or a read route's call. */
export type RenderKind = "page" | "navigation" | "prefetch" | "read";

export type ServerTimings = {
  /** Times one piece of work under a step. Work under the same step that overlaps counts once. */
  time<T>(step: TimingStep, work: () => Promise<T>): Promise<T>;
  /** The page names its route when it starts; the frame's steps were already timed by then. */
  nameRoute(route: RoutePattern): void;
  /** The response's first byte is going out: the render so far is what the person waited for. */
  markFirstByte(): void;
  /** The Server-Timing header value: the steps finished so far and the render up to the first byte (or now). */
  header(): string;
  /** The one structured log line, written when the response is complete. */
  logLine(): string;
};

const round = (ms: number) => Math.round(ms * 10) / 10;

/** Total time covered by the intervals, overlapping parts counted once. */
function covered(intervals: Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let reach = -Infinity;
  for (const { start, end } of sorted) {
    if (end <= reach) continue;
    total += end - Math.max(start, reach);
    reach = end;
  }
  return total;
}

export function createServerTimings({ route, clock, kind = "page", cold = false }: {
  route?: RoutePattern;
  clock: () => number;
  kind?: RenderKind;
  /** The first render since this server instance started. */
  cold?: boolean;
}): ServerTimings {
  const startedAt = clock();
  let routeName = route;
  let firstByteAt: number | null = null;
  const renderTime = () => round((firstByteAt ?? clock()) - startedAt);
  const finished = new Map<TimingStep, Interval[]>();

  function stepDurations(): [TimingStep, number][] {
    return TIMING_STEPS.flatMap((step) => {
      const intervals = finished.get(step);
      return intervals ? [[step, round(covered(intervals))] as [TimingStep, number]] : [];
    });
  }

  return {
    async time(step, work) {
      const start = clock();
      try {
        return await work();
      } finally {
        const intervals = finished.get(step) ?? [];
        intervals.push({ start, end: clock() });
        finished.set(step, intervals);
      }
    },
    nameRoute(next) {
      routeName = next;
    },
    markFirstByte() {
      firstByteAt ??= clock();
    },
    header() {
      const parts = [
        ...(routeName ? [`route;desc="${routeName}"`] : []),
        ...(cold ? ["cold"] : []),
        ...stepDurations().map(([step, ms]) => `${step};dur=${ms}`),
        `render;dur=${renderTime()}`,
      ];
      return parts.join(", ");
    },
    logLine() {
      return JSON.stringify({
        serverTiming: routeName ?? "unnamed",
        kind,
        cold,
        steps: Object.fromEntries(stepDurations()),
        render: renderTime(),
        total: round(clock() - startedAt),
      });
    },
  };
}
