import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { redirect } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// #265: a page render's timings, driven as Next drives them: the request's headers (set by the proxy) and the
// work `after()` runs once the response is complete. The log line is what Vercel's runtime logs receive.
const request = vi.hoisted(() => ({ headers: null as Headers | Error | null, afterResponse: [] as (() => unknown)[] }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (request.headers instanceof Error || request.headers === null) throw request.headers ?? new Error("outside a request");
    return request.headers;
  },
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (work: () => unknown) => { request.afterResponse.push(work); } }));
// React's `cache` lasts one server request; outside a server render it caches nothing, so stand in for it here.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <A extends unknown[], R>(work: (...args: A) => R) => {
    let forRequest: unknown, value: R;
    return (...args: A) => {
      if (forRequest !== request.headers) { forRequest = request.headers; value = work(...args); }
      return value;
    };
  },
}));

import { callTimings, timePage, timed } from "./request-timings";
import { READ_TIMING_ID_HEADER, TIMING_ID_HEADER } from "./server-timing";

const PROXY_ID = "0b6f1d3e-6c1a-4f8e-9d2b-3f4a5b6c7d8e";
let logged: string[] = [];

beforeEach(() => {
  request.afterResponse = [];
  logged = [];
  vi.spyOn(console, "info").mockImplementation((line: string) => { logged.push(line); });
});
afterEach(() => { vi.restoreAllMocks(); });

const completeResponse = async () => { for (const work of request.afterResponse.splice(0)) await work(); };
const timingLines = () => logged.filter(line => line.startsWith('{"serverTiming"')).map(line => JSON.parse(line));

async function renderPage(headers: Record<string, string>) {
  request.headers = new Headers(headers);
  await timePage("Inbox");
  await timed("data", async () => "rows");
  await completeResponse();
}

describe("a page render's timings", () => {
  it("writes one log line for a request the proxy tagged", async () => {
    await renderPage({ [TIMING_ID_HEADER]: PROXY_ID });
    expect(timingLines()).toEqual([expect.objectContaining({ serverTiming: "Inbox", kind: "page", steps: { data: expect.any(Number) } })]);
  });

  it("ignores a timing id the proxy could not have made, such as one a browser sent to an address the proxy skips", async () => {
    await renderPage({ [TIMING_ID_HEADER]: "anything-a-client-sends" });
    expect(timingLines()).toEqual([]);
  });

  it("lets Next's own control flow through, so a redirect or a dynamic bail-out while reading headers still happens", async () => {
    let nextError: unknown;
    try { redirect("/login"); } catch (error) { nextError = error; }
    request.headers = nextError as Error;
    await expect(timed("data", async () => "rows")).rejects.toBe(nextError);
  });

  it("simply runs the work outside a request (a test rendering a page directly)", async () => {
    request.headers = null;
    await expect(timed("data", async () => "rows")).resolves.toBe("rows");
    expect(timingLines()).toEqual([]);
  });

  it("times a read route's call once its response is complete, and only under an id the proxy made", async () => {
    request.headers = new Headers({ [READ_TIMING_ID_HEADER]: PROXY_ID });
    const tagged = callTimings("Request preview");
    await tagged.time("data", async () => "detail");
    await tagged.respond(new Response("{}"));
    expect(timingLines()).toEqual([]);
    await completeResponse();
    expect(timingLines()).toEqual([expect.objectContaining({ serverTiming: "Request preview", kind: "read" })]);

    logged = [];
    request.headers = new Headers({ [READ_TIMING_ID_HEADER]: "not-from-the-proxy" });
    await callTimings("Request preview").respond(new Response("{}"));
    // No id it can trust: the line is written at once, with no response head to wait for.
    expect(timingLines()).toEqual([expect.objectContaining({ serverTiming: "Request preview" })]);
    expect(request.afterResponse).toEqual([]);
  });
});

// Every signed-in page names the route its timings belong to, or its log lines read "unnamed". Each page under
// (app), and onboarding (signed in, outside the app frame), with the name it must give; a new page fails here until
// it is timed and listed.
const SIGNED_IN_PAGES: Record<string, string> = {
  "src/app/(app)/(list)/page.tsx": "Requests list",
  "src/app/(app)/requests/[id]/page.tsx": "Request page",
  "src/app/(app)/inbox/page.tsx": "Inbox",
  "src/app/(app)/intake/page.tsx": "Intake",
  "src/app/(app)/impact/page.tsx": "Impact",
  "src/app/(app)/settings/profile/page.tsx": "Settings: Profile",
  "src/app/(app)/settings/members/page.tsx": "Settings: Members",
  "src/app/(app)/settings/metrics/page.tsx": "Settings: Metrics",
  "src/app/(app)/settings/metrics/[id]/page.tsx": "Settings: a Metric",
  "src/app/(auth)/onboarding/page.tsx": "Onboarding",
};

const root = resolve(__dirname, "../..");
const pagesUnder = (directory: string): string[] => readdirSync(join(root, directory), { recursive: true, encoding: "utf8" })
  .filter(path => path.split("/").pop() === "page.tsx").map(path => join(directory, path));

/** The `timePage` names in a page and in the workspace files it renders (`./` or `../` imports). */
function namedRoutes(page: string): string[] {
  const source = readFileSync(join(root, page), "utf8");
  const local = [...source.matchAll(/from\s+["'](\.{1,2}\/[^"']+)["']/g)]
    .map(match => resolve(dirname(join(root, page)), match[1]))
    .flatMap(base => [`${base}.tsx`, `${base}.ts`].filter(existsSync));
  return [source, ...local.map(file => readFileSync(file, "utf8"))]
    .flatMap(text => [...text.matchAll(/timePage\(\s*"([^"]+)"\s*\)/g)].map(match => match[1]));
}

describe("signed-in pages", () => {
  it("are all listed here (every page under the app frame, and onboarding)", () => {
    expect([...pagesUnder("src/app/(app)"), "src/app/(auth)/onboarding/page.tsx"].map(path => relative(root, join(root, path))).sort())
      .toEqual(Object.keys(SIGNED_IN_PAGES).sort());
  });

  it.each(Object.entries(SIGNED_IN_PAGES))("%s names its route %s", (page, route) => {
    expect(namedRoutes(page)).toEqual([route]);
  });
});
