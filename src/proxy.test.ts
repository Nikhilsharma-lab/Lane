/**
 * #387 (spec #383 "The proxy"): the proxy as Next calls it, with a request. What it passes on to the server is read
 * from Next's own override headers on its response.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { queryCounter } from "@/db";
import { RETURN_ADDRESS_HEADER } from "@/lib/auth-return-address";
import { READ_TIMING_ID_HEADER, TIMING_ID_HEADER, isTimingId } from "@/lib/server-timing";
import proxy, { config } from "./proxy";

const ORIGIN = "https://lane.example";
// Only the cookie's presence counts here; the guards behind the proxy check it.
const COOKIE = "better-auth.session_token=anything";

type Init = { method?: string; headers?: Record<string, string>; cookie?: string };
const request = (path: string, { method = "GET", headers = {}, cookie }: Init = {}) =>
  new NextRequest(`${ORIGIN}${path}`, { method, headers: cookie ? { ...headers, cookie } : headers });

const sentTo = (path: string, init?: Init) => {
  const location = proxy(request(path, init)).headers.get("location");
  return location === null ? null : location.replace(ORIGIN, "");
};
/** The request headers the proxy hands the server, or null when it answered the request itself. */
function passedOn(response: Response) {
  if (response.headers.get("x-middleware-next") !== "1") return null;
  const names = (response.headers.get("x-middleware-override-headers") ?? "").split(",");
  return new Headers(names.map((name): [string, string] => [name, response.headers.get(`x-middleware-request-${name}`)!]));
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("a page request without a session cookie", () => {
  it("goes to sign in, with its path and query as the return address", () => {
    expect(sentTo("/requests/LAN-7?view=board&item=1")).toBe("/login?redirect_url=%2Frequests%2FLAN-7%3Fview%3Dboard%26item%3D1");
    expect(sentTo("/onboarding")).toBe("/login?redirect_url=%2Fonboarding");
    expect(sentTo("/inbox", { method: "HEAD" })).toBe("/login?redirect_url=%2Finbox");
  });

  it("goes to sign in with no return address from Lane's home", () => {
    expect(sentTo("/")).toBe("/login");
  });

  it.each(["//x", "//x/requests", "/\\x"])("never hands on a return address to another site: %s", (path) => {
    const location = new URL(proxy(request(path)).headers.get("location")!);
    expect(location.origin).toBe(ORIGIN);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect_url") ?? "/").toMatch(/^\/(?![/\\])/);
  });

  it("ignores an empty session cookie and other cookies", () => {
    expect(sentTo("/requests", { cookie: "better-auth.session_token=; theme=dark" })).toBe("/login?redirect_url=%2Frequests");
  });

  it.each(["/login", "/login?redirect_url=%2Frequests", "/signup", "/forgot-password", "/reset-password", "/invite/inv_123", "/privacy", "/terms"])("passes to the signed-out page %s", (path) => {
    const response = proxy(request(path));
    expect(response.headers.get("location")).toBeNull();
    expect(passedOn(response)).not.toBeNull();
  });

  it.each(["/loginx", "/login/tasks", "/privacy/more", "/invite", "/invitex/1", "/apiary"])("doesn't take %s for a signed-out page", (path) => {
    expect(sentTo(path)).toBe(`/login?redirect_url=${encodeURIComponent(path)}`);
  });

  it.each(["/api/auth/get-session", "/api/requests/1?org=o", "/api/inbox/daily", "/api"])("passes %s", (path) => {
    expect(passedOn(proxy(request(path)))).not.toBeNull();
  });

  it("passes a Server Action's POST, with or without JavaScript's header, so the action can say the session ended", () => {
    expect(passedOn(proxy(request("/requests", { method: "POST", headers: { "next-action": "abc" } })))).not.toBeNull();
    expect(passedOn(proxy(request("/requests", { method: "POST" })))).not.toBeNull();
  });
});

describe("a page request with a session cookie", () => {
  it.each(["better-auth.session_token", "__Secure-better-auth.session_token"])("passes with %s", (name) => {
    expect(passedOn(proxy(request("/requests", { cookie: `${name}=anything` })))).not.toBeNull();
  });

  it("hands the server its path and query, whatever the browser sent in that header", () => {
    const response = proxy(request("/requests/LAN-7?view=board", { cookie: COOKIE, headers: { [RETURN_ADDRESS_HEADER]: "https://x" } }));
    expect(passedOn(response)!.get(RETURN_ADDRESS_HEADER)).toBe("/requests/LAN-7?view=board");
  });

  it("keeps the request's own headers", () => {
    expect(passedOn(proxy(request("/requests", { cookie: COOKIE, headers: { "x-some-header": "kept" } })))!.get("x-some-header")).toBe("kept");
  });
});

describe("timings", () => {
  it("tags a page with a page timing id, replacing any the browser sent", () => {
    const passed = passedOn(proxy(request("/requests", { cookie: COOKIE, headers: { [TIMING_ID_HEADER]: "mine", [READ_TIMING_ID_HEADER]: "mine" } })))!;
    expect(isTimingId(passed.get(TIMING_ID_HEADER)!)).toBe(true);
    expect(passed.get(READ_TIMING_ID_HEADER)).toBeNull();
  });

  it("tags a read route with a read timing id, replacing any the browser sent", () => {
    const passed = passedOn(proxy(request("/api/requests/1", { headers: { [TIMING_ID_HEADER]: "mine", [READ_TIMING_ID_HEADER]: "mine" } })))!;
    expect(isTimingId(passed.get(READ_TIMING_ID_HEADER)!)).toBe(true);
    expect(passed.get(TIMING_ID_HEADER)).toBeNull();
  });

  it("adds its own Server-Timing step only while the switch is on", () => {
    vi.stubEnv("LANE_SERVER_TIMING_HEADER", "");
    expect(proxy(request("/requests", { cookie: COOKIE })).headers.get("server-timing")).toBeNull();
    vi.stubEnv("LANE_SERVER_TIMING_HEADER", "1");
    for (const response of [proxy(request("/requests", { cookie: COOKIE })), proxy(request("/requests")), proxy(request("/privacy")), proxy(request("/api/requests/1"))]) {
      expect(response.headers.get("server-timing")).toMatch(/^proxy;dur=[\d.]+$/);
    }
  });
});

it("runs no database query", async () => {
  const { statements } = await queryCounter.measure(async () => {
    proxy(request("/requests", { cookie: COOKIE }));
    proxy(request("/requests"));
    proxy(request("/api/requests/1", { cookie: COOKIE }));
  });
  expect(statements).toBe(0);
});

it("runs for pages and /api, and not for Next's own files or static ones", () => {
  const runsFor = (path: string) => config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(path));
  for (const path of ["/", "/requests/LAN-7", "/login", "/api/auth/get-session", "/api/requests/1"]) expect(runsFor(path)).toBe(true);
  for (const path of ["/_next/static/chunk.js", "/icon.svg", "/opengraph-image.png", "/manifest.webmanifest"]) expect(runsFor(path)).toBe(false);
  expect(config.matcher.join(" ")).not.toContain("clerk");
});
