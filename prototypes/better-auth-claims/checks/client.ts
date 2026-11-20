// PROTOTYPE (#344). A cookie-keeping "browser" that drives Better Auth's real
// HTTP handler in-process, so captcha, rate limits, CSRF and cookies all apply.
import { auth, TURNSTILE_DUMMY_TOKEN } from "../lib/auth";
import { queries } from "../lib/db";

export const BASE = "http://localhost:3344/api/auth";
export type Res = { status: number; body: any; ms: number; queries: number };

export class Browser {
  cookies = new Map<string, string>();
  constructor(public name: string, public ip = "203.0.113.10", public captcha = true) {}
  cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "); }
  headers(extra: Record<string, string> = {}) {
    const h = new Headers({ origin: "http://localhost:3344", "x-vercel-forwarded-for": this.ip, ...extra });
    if (this.cookies.size) h.set("cookie", this.cookieHeader());
    if (this.captcha) h.set("x-captcha-response", TURNSTILE_DUMMY_TOKEN);
    return h;
  }
  async call(path: string, body?: unknown, init: { method?: string; headers?: Record<string, string> } = {}): Promise<Res> {
    const method = init.method ?? (body === undefined ? "GET" : "POST");
    const headers = this.headers(init.headers);
    if (body !== undefined) headers.set("content-type", "application/json");
    const q0 = queries.count;
    const t0 = performance.now();
    const res = await auth.handler(new Request(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" }));
    const ms = performance.now() - t0;
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      const expired = attrs.some((a) => /max-age=0/i.test(a)) || v === "";
      if (expired) this.cookies.delete(k); else this.cookies.set(k, v);
    }
    const text = await res.text();
    let parsed: any = text;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    if (res.status >= 300 && res.status < 400) parsed = { location: res.headers.get("location"), body: parsed };
    return { status: res.status, body: parsed, ms, queries: queries.count - q0 };
  }
}

// Plain-language report lines.
const lines: string[] = [];
export function report(kind: "CONFIRMED" | "REFUTED" | "FINDING" | "MEASURED" | "INFO", claim: string, detail = "") {
  const line = `${kind.padEnd(9)} ${claim}${detail ? `\n          ${detail}` : ""}`;
  lines.push(line);
  console.log(line);
}
export function expect(ok: boolean, claim: string, detail = "") { report(ok ? "CONFIRMED" : "REFUTED", claim, detail); return ok; }
export const short = (r: Res) => `${r.status} ${JSON.stringify(r.body)?.slice(0, 220)}`;
export function section(title: string) { console.log(`\n## ${title}\n`); }
