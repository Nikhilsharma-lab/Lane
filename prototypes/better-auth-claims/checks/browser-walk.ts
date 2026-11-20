// PROTOTYPE (#344). Drives the production build (pnpm build && pnpm start) in
// Chromium: login page speed with Turnstile, sign-in to the signed-in page,
// proxy and per-page session cost, server actions, revocation and sign-out.
// Run: pnpm db:reset && npx tsx scripts/seed-walk.ts && (start server) && npx tsx checks/browser-walk.ts
import { chromium, type Page } from "playwright";
import { outbox } from "../lib/auth";
import { sql } from "../lib/db";
import { Browser, expect, report, section, short } from "./client";

const URL_ = "http://localhost:3344";
const PASSWORD = "violet-otter-344-lane";
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const serverQueries = async () => (await (await fetch(`${URL_}/api/proto/queries`)).json()).count as number;
void outbox;

const browser = await chromium.launch();
let ip = 1;
const context = () => browser.newContext({ extraHTTPHeaders: { "x-vercel-forwarded-for": `10.44.0.${ip++}` } });
const marks = (p: Page) => p.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
  return { fcp, domInteractive: nav.domInteractive, ...(window as any).__proto };
});

section("Login page with Turnstile (local production build, desktop Chromium)");
const loginRuns: { first: any; returning: any }[] = [];
for (let i = 0; i < 5; i++) {
  const ctx = await context();
  const p = await ctx.newPage();
  await p.goto(`${URL_}/login`);
  await p.waitForFunction(() => (window as any).__proto?.turnstileToken, null, { timeout: 15000 });
  const first = await marks(p);
  await p.goto(`${URL_}/login`);
  await p.waitForFunction(() => (window as any).__proto?.turnstileToken, null, { timeout: 15000 });
  const returning = await marks(p);
  loginRuns.push({ first, returning });
  await ctx.close();
}
for (const kind of ["first", "returning"] as const) {
  const m = (k: string) => median(loginRuns.map((r) => r[kind][k])).toFixed(0);
  report("MEASURED", `${kind === "first" ? "First visit" : "Returning visit"}: on screen ${m("fcp")} ms, form usable ${m("formUsable")} ms, Turnstile script ${m("turnstileScript")} ms, token ready ${m("turnstileToken")} ms`,
    "median of 5; target (#231) desktop returning ≤0.5 s on screen, ≤1.0 s usable; Clerk today ~1,026 ms usable (DEFERRED SIGN-IN FORM SPEED)");
}

section("Password sign-in → signed-in page");
const signIns: number[] = [], waits: number[] = [], responses: number[] = [];
let proxyTiming = "", pageRead = "", pageQueries = 0;
for (let i = 0; i < 5; i++) {
  const ctx = await context();
  const p = await ctx.newPage();
  await p.goto(`${URL_}/login`);
  await p.waitForFunction(() => (window as any).__proto?.turnstileToken, null, { timeout: 15000 });
  await p.fill('input[name="email"]', "walk@example.test");
  await p.fill('input[name="password"]', PASSWORD);
  const t0 = Date.now();
  const appResponse = p.waitForResponse((r) => r.url() === `${URL_}/app` && r.request().resourceType() === "document");
  await p.click("button");
  await p.waitForSelector("#signed-in");
  signIns.push(Date.now() - t0);
  const m = await marks(p).catch(() => ({}));
  void m;
  const r = await appResponse;
  proxyTiming = (await r.allHeaders())["server-timing"] ?? "";
  pageRead = await p.textContent("#read-ms") ?? "";
  // one more signed-in page load, counting database transactions
  const q0 = await serverQueries();
  await p.reload();
  await p.waitForSelector("#signed-in");
  pageQueries = (await serverQueries()) - q0;
  await ctx.close();
}
report("MEASURED", `Click "Sign in" → signed-in page painted: median ${median(signIns)} ms (runs ${signIns.join(", ")})`,
  "includes the sign-in request (Turnstile siteverify, password hash check), the redirect, proxy and the /app render");
report("MEASURED", `proxy.ts session check: ${proxyTiming}; /app session + role read: ${pageRead} ms; database queries per signed-in page load (proxy + page): ${pageQueries}`,
  "local Postgres; on Vercel hnd1 → Supabase ap-northeast-1 each query adds a network round trip");

section("Fast submit: the form is sent the moment it is usable (password manager)");
const fast: number[] = [], fastWait: number[] = [];
for (let i = 0; i < 5; i++) {
  const ctx = await context();
  const p = await ctx.newPage();
  const t0 = Date.now();
  await p.goto(`${URL_}/login`);
  await p.waitForFunction(() => (window as any).__proto?.formUsable);
  await p.fill('input[name="email"]', "walk@example.test");
  await p.fill('input[name="password"]', PASSWORD);
  await p.click("button");
  await p.waitForSelector("#signed-in");
  fast.push(Date.now() - t0);
  await ctx.close();
}
report("MEASURED", `Open /login, autofill and submit at once → signed-in page: median ${median(fast)} ms (runs ${fast.join(", ")})`,
  "here the person waits for Turnstile's token; target ≤1.0 s usable applies to the form, which is usable in tens of ms");

section("Server actions and revocation in the running app");
{
  const ctx = await context();
  const p = await ctx.newPage();
  await p.goto(`${URL_}/login`);
  await p.waitForFunction(() => (window as any).__proto?.turnstileToken);
  await p.fill('input[name="email"]', "walk@example.test");
  await p.fill('input[name="password"]', PASSWORD);
  await p.click("button");
  await p.waitForSelector("#signed-in");
  await p.fill('input[name="name"]', "Walk Studio Renamed");
  await p.click("#rename");
  await p.waitForSelector("#msg");
  expect((await p.textContent("#msg")) === "renamed" && (await p.textContent("#org")) === "Walk Studio Renamed", "A server action reads the session from the cookie and an Admin renames the workspace", `msg ${await p.textContent("#msg")}`);

  // Bo (the other Admin) demotes Wren to Viewer through Better Auth, in another process.
  const boss = new Browser("boss", "198.51.100.99");
  await boss.call("/sign-in/email", { email: "boss@example.test", password: PASSWORD });
  const [org] = await sql`select id from organizations limit 1`;
  await boss.call("/organization/set-active", { organizationId: org.id });
  const members = await boss.call(`/organization/list-members?organizationId=${org.id}`);
  const wren = members.body.members.find((m: any) => m.user.email === "walk@example.test");
  const t0 = Date.now();
  const demote = await boss.call("/organization/update-member-role", { memberId: wren.id, role: "viewer", organizationId: org.id });
  await p.fill('input[name="name"]', "Viewer tries");
  await p.click("#rename");
  await p.waitForURL(/msg=refused/);
  expect((await p.textContent("#msg")) === "refused-as-viewer", `The demotion applies to Wren's very next server action (${Date.now() - t0} ms after it, including the click)`, short(demote).slice(0, 60));

  await boss.call("/organization/remove-member", { memberIdOrEmail: wren.id, organizationId: org.id });
  await p.goto(`${URL_}/app`);
  expect((await p.textContent("#role")) === "not a member", "After removal, Wren's next page shows no membership", `role: ${await p.textContent("#role")}`);

  await p.click("#sign-out");
  await p.waitForURL(/\/login/);
  const cookies = await ctx.cookies();
  expect(!cookies.some((c) => c.name.includes("session_token")), "A server-action sign-out clears the session cookie (nextCookies)", cookies.map((c) => c.name).join(", ") || "no cookies");
  await p.goto(`${URL_}/app`);
  expect(p.url().endsWith("/login"), "proxy.ts sends a signed-out visit to /app back to /login", p.url());
  await ctx.close();
}

section("Sign-in from a server action (auth.api, not the HTTP handler)");
{
  const ctx = await context();
  const p = await ctx.newPage();
  await p.goto(`${URL_}/login-action`);
  await p.fill('input[name="email"]', "boss@example.test");
  await p.fill('input[name="password"]', PASSWORD);
  await p.click("button");
  await p.waitForLoadState("networkidle");
  const noCaptchaSignedIn = p.url().endsWith("/app");
  report(noCaptchaSignedIn ? "FINDING" : "CONFIRMED",
    noCaptchaSignedIn ? "A server action calling auth.api.signInEmail signs in WITHOUT a Turnstile token: the captcha plugin only guards HTTP requests to /api/auth"
                      : "A server action sign-in without a Turnstile token is refused",
    noCaptchaSignedIn ? "So every Lane sign-in, sign-up, code and reset form must call /api/auth from the browser (Better Auth's client), never auth.api from an action." : (await p.textContent("#error").catch(() => "")) ?? "");
  const cookies = await ctx.cookies();
  expect(!noCaptchaSignedIn || cookies.some((c) => c.name.includes("session_token")), "When a server action signs in, nextCookies() sets the session cookie", cookies.map((c) => c.name).join(", "));
  await ctx.close();
}

await browser.close();
await sql.end();
