import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  contentSecurityPolicyDirectives,
  securityHeaders,
} from "./security-headers";

function directiveMap(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name) map.set(name, sources);
  }
  return map;
}

describe("securityHeaders", () => {
  const headers = securityHeaders();
  const byKey = new Map(headers.map((header) => [header.key, header.value]));

  it("sets the baseline headers", () => {
    expect(byKey.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("ships the CSP in report-only, not enforced", () => {
    expect(byKey.has("Content-Security-Policy-Report-Only")).toBe(true);
    expect(byKey.has("Content-Security-Policy")).toBe(false);
  });

  it("has no newline in any header value", () => {
    for (const header of headers) {
      expect(header.value, header.key).not.toMatch(/[\r\n]/);
      expect(header.key).not.toMatch(/[\r\n]/);
    }
  });

  it("has no duplicate header keys", () => {
    expect(new Set(headers.map((header) => header.key)).size).toBe(headers.length);
  });
});

describe("buildContentSecurityPolicy", () => {
  const csp = directiveMap(buildContentSecurityPolicy());

  it("declares every required directive", () => {
    for (const name of [
      "default-src",
      "script-src",
      "style-src",
      "font-src",
      "img-src",
      "connect-src",
      "frame-src",
      "worker-src",
      "object-src",
      "base-uri",
      "form-action",
      "frame-ancestors",
    ]) {
      expect(csp.has(name), name).toBe(true);
    }
  });

  it("locks down the structural directives", () => {
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("allows Clerk, Cloudflare bot protection and Clerk avatars", () => {
    for (const host of ["https://*.clerk.accounts.dev", "https://clerk.uselane.app", "https://*.uselane.app"]) {
      expect(csp.get("script-src")).toContain(host);
      expect(csp.get("connect-src")).toContain(host);
      expect(csp.get("frame-src")).toContain(host);
    }
    expect(csp.get("connect-src")).toContain("wss://*.clerk.accounts.dev");
    expect(csp.get("connect-src")).toContain("wss://clerk.uselane.app");
    expect(csp.get("script-src")).toContain("https://challenges.cloudflare.com");
    expect(csp.get("frame-src")).toContain("https://challenges.cloudflare.com");
    expect(csp.get("img-src")).toContain("https://img.clerk.com");
  });

  it("allows Supabase storage over https and wss", () => {
    expect(csp.get("connect-src")).toContain("https://*.supabase.co");
    expect(csp.get("connect-src")).toContain("wss://*.supabase.co");
    expect(csp.get("img-src")).toContain("https://*.supabase.co");
  });

  it("adds the project's own Supabase origin without duplicating the wildcard", () => {
    const withProject = directiveMap(
      buildContentSecurityPolicy({ supabaseUrl: "https://jznepeqghjixcrpuddym.supabase.co" }),
    );
    expect(withProject.get("connect-src")).toContain("https://jznepeqghjixcrpuddym.supabase.co");
    expect(withProject.get("connect-src")).toContain("wss://jznepeqghjixcrpuddym.supabase.co");
    expect(withProject.get("connect-src")?.filter((s) => s === "https://*.supabase.co")).toHaveLength(1);

    // Garbage or non-https values are ignored rather than breaking the header.
    expect(buildContentSecurityPolicy({ supabaseUrl: "not a url" })).toBe(buildContentSecurityPolicy());
    expect(buildContentSecurityPolicy({ supabaseUrl: "http://localhost:54321" })).toBe(
      buildContentSecurityPolicy(),
    );
  });

  it("allows Vercel tooling and Google Fonts", () => {
    expect(csp.get("script-src")).toContain("https://vercel.live");
    expect(csp.get("script-src")).toContain("https://va.vercel-scripts.com");
    expect(csp.get("connect-src")).toContain("https://vitals.vercel-insights.com");
    expect(csp.get("style-src")).toContain("https://fonts.googleapis.com");
    expect(csp.get("font-src")).toContain("https://fonts.gstatic.com");
  });

  it("keeps inline styles and scripts (nonce-free policy) and images from self, data and blob", () => {
    expect(csp.get("style-src")).toContain("'unsafe-inline'");
    expect(csp.get("script-src")).toContain("'unsafe-inline'");
    for (const source of ["'self'", "data:", "blob:"]) {
      expect(csp.get("img-src")).toContain(source);
    }
  });

  it("allows 'unsafe-eval' only in development", () => {
    expect(csp.get("script-src")).not.toContain("'unsafe-eval'");
    const dev = directiveMap(buildContentSecurityPolicy({ development: true }));
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
  });

  it("has no duplicate directives or sources", () => {
    const directives = contentSecurityPolicyDirectives();
    const names = directives.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length);
    for (const [name, sources] of csp) {
      expect(new Set(sources).size, name).toBe(sources.length);
    }
  });
});
