import "server-only";

import { ServerResponse } from "node:http";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";

import { serverTimingHeader } from "@/lib/feature-switches";
import { READ_TIMING_ID_HEADER, TIMING_ID_HEADER, createServerTimings, isTimingId, type RenderKind, type RoutePattern, type ServerTimings, type TimingStep } from "@/lib/server-timing";

/**
 * #265: the server timings of the request being rendered. Pages and the app frame time their steps through
 * `timed`; the page names its route with `timePage`. One log line per render is written once the response is
 * complete (Vercel's runtime logs); while `LANE_SERVER_TIMING_HEADER` is on, the response also carries the steps
 * that finished before its first byte as a Server-Timing header.
 *
 * Next gives a page no way to add a response header, so the header is added where Node sends the response's head:
 * the proxy tags each request with a random timing id, the render registers its timings under that id, and the
 * response's head looks them up by the id on its own request. Shared on globalThis because each route is its own
 * bundle in one server.
 */
type Registry = { byId: Map<string, ServerTimings>; rendered: boolean; hooked: boolean };
const REGISTRY = Symbol.for("lane.serverTimings");
const store = globalThis as typeof globalThis & { [REGISTRY]?: Registry };
const registry: Registry = (store[REGISTRY] ??= { byId: new Map(), rendered: false, hooked: false });
/** Far above any number of renders in flight at once; only a response that never completed could be left over. */
const REGISTRY_LIMIT = 500;

const clock = () => performance.now();

function kindOf(requestHeaders: Headers): RenderKind {
  if (requestHeaders.get("next-router-prefetch") === "1") return "prefetch";
  return requestHeaders.get("rsc") === "1" ? "navigation" : "page";
}

function hookResponseHead() {
  if (registry.hooked) return;
  registry.hooked = true;
  const writeHead = ServerResponse.prototype.writeHead;
  ServerResponse.prototype.writeHead = function (this: ServerResponse, ...args: Parameters<typeof writeHead>) {
    const id = this.req?.headers[TIMING_ID_HEADER] ?? this.req?.headers[READ_TIMING_ID_HEADER];
    const timings = typeof id === "string" ? registry.byId.get(id) : undefined;
    if (timings && !this.headersSent) {
      timings.markFirstByte();
      if (serverTimingHeader()) this.appendHeader("Server-Timing", timings.header());
    }
    return writeHead.apply(this, args);
  } as typeof writeHead;
}

/**
 * The response's head carries the timings (while the switch is on) and marks their first byte; the log line is
 * written once the response is complete.
 */
function logOnceComplete(id: string, timings: ServerTimings) {
  hookResponseHead();
  if (registry.byId.size >= REGISTRY_LIMIT) registry.byId.delete(registry.byId.keys().next().value!);
  registry.byId.set(id, timings);
  after(() => {
    registry.byId.delete(id);
    console.info(timings.logLine());
  });
}

/** For work with no response head to wait for: what ran so far is all there is. */
function logNow(timings: ServerTimings) {
  timings.markFirstByte();
  console.info(timings.logLine());
}

/** The request's headers, or null outside a request (a test calling a page or a route directly). */
async function requestHeaders(): Promise<Headers | null> {
  try {
    return await headers();
  } catch (error) {
    // A dynamic bail-out or a redirect is Next's to handle; only "no request here" means untimed.
    unstable_rethrow(error);
    return null;
  }
}

/** The timing id the proxy set, if this request has one. Anything not shaped like the proxy's ids is ignored. */
async function timingId(header: string): Promise<{ headers: Headers; id: string | null } | null> {
  const incoming = await requestHeaders();
  if (!incoming) return null;
  const id = incoming.get(header);
  return { headers: incoming, id: id && isTimingId(id) ? id : null };
}

/**
 * This render's timings. Null for anything that isn't a page render the proxy tagged: a server action (which
 * shares its page's address), a route handler, or a test rendering a page directly.
 */
const renderTimings = cache(async function renderTimings(): Promise<ServerTimings | null> {
  const tagged = await timingId(TIMING_ID_HEADER);
  if (!tagged?.id || tagged.headers.has("next-action")) return null;
  const timings = createServerTimings({ clock, kind: kindOf(tagged.headers), cold: !registry.rendered });
  registry.rendered = true;
  logOnceComplete(tagged.id, timings);
  return timings;
});

/** Times one step of the current render. Outside a request the work simply runs. */
export async function timed<T>(step: TimingStep, work: () => Promise<T>): Promise<T> {
  const timings = await renderTimings();
  return timings ? timings.time(step, work) : work();
}

/**
 * The page names the route its render's timings belong to (the frame's steps are timed before the page runs).
 * Pages call it without waiting, so it never rejects: whatever reading the headers threw (a redirect or a dynamic
 * bail-out) reaches the page through its own `timed` steps.
 */
export function timePage(route: RoutePattern): Promise<void> {
  return renderTimings().then(timings => { timings?.nameRoute(route); }, () => {});
}

/**
 * Timings for one call of a read route or a server action, which aren't a page render. A server action calls
 * `finish` to write its log line. A route handler returns its response through `respond`: the log line is written
 * once the response is complete and, while the switch is on, the response's head carries the Server-Timing header
 * (added where Node sends it, as for a page, so the proxy's own header can't replace it).
 */
export function callTimings(route: RoutePattern) {
  const timings = createServerTimings({ route, clock, kind: "read", cold: !registry.rendered });
  registry.rendered = true;
  return {
    time: timings.time,
    finish: () => logNow(timings),
    async respond(response: Response): Promise<Response> {
      const id = (await timingId(READ_TIMING_ID_HEADER))?.id;
      if (id) logOnceComplete(id, timings);
      else logNow(timings);
      return response;
    },
  };
}
