import "server-only";

import { ServerResponse } from "node:http";
import { headers } from "next/headers";
import { after } from "next/server";
import { cache } from "react";

import { serverTimingHeader } from "@/lib/feature-switches";
import { READ_TIMING_ID_HEADER, TIMING_ID_HEADER, createServerTimings, type RenderKind, type RoutePattern, type ServerTimings, type TimingStep } from "@/lib/server-timing";

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

function register(id: string, timings: ServerTimings) {
  if (registry.byId.size >= REGISTRY_LIMIT) registry.byId.delete(registry.byId.keys().next().value!);
  registry.byId.set(id, timings);
}

/**
 * This render's timings. Null for anything that isn't a page render the proxy tagged: a server action (which
 * shares its page's address), a route handler, or a test rendering a page directly.
 */
const renderTimings = cache(async function renderTimings(): Promise<ServerTimings | null> {
  let requestHeaders: Headers;
  try {
    requestHeaders = await headers();
  } catch {
    return null;
  }
  const id = requestHeaders.get(TIMING_ID_HEADER);
  if (!id || requestHeaders.has("next-action")) return null;
  const timings = createServerTimings({ clock, kind: kindOf(requestHeaders), cold: !registry.rendered });
  registry.rendered = true;
  hookResponseHead();
  register(id, timings);
  after(() => {
    registry.byId.delete(id);
    console.info(timings.logLine());
  });
  return timings;
});

/** Times one step of the current render. Outside a request the work simply runs. */
export async function timed<T>(step: TimingStep, work: () => Promise<T>): Promise<T> {
  const timings = await renderTimings();
  return timings ? timings.time(step, work) : work();
}

/** The page names the route its render's timings belong to (the frame's steps are timed before the page runs). */
export async function timePage(route: RoutePattern): Promise<void> {
  (await renderTimings())?.nameRoute(route);
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
    finish() {
      timings.markFirstByte();
      console.info(timings.logLine());
    },
    async respond(response: Response): Promise<Response> {
      const id = (await headers()).get(READ_TIMING_ID_HEADER);
      if (!id) {
        timings.markFirstByte();
        console.info(timings.logLine());
        return response;
      }
      hookResponseHead();
      register(id, timings);
      after(() => {
        registry.byId.delete(id);
        console.info(timings.logLine());
      });
      return response;
    },
  };
}
