import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { SIGN_IN_URL, SIGN_UP_URL, sessionTaskRedirect } from "./session-task-urls";

const at = (path: string) => sessionTaskRedirect(new URL(path, "https://app.uselane.app"))?.toString() ?? null;

// D1 (#257): with a Clerk session task pending, Clerk's server-side redirect goes to
// `<sign-in URL>/tasks`, which Lane has no page for. The proxy sends it where the browser goes.
describe("sessionTaskRedirect", () => {
  it("sends Clerk's server-side task address to the sign-in page, keeping Clerk's return address", () => {
    expect(at("/login/tasks?redirect_url=https%3A%2F%2Fapp.uselane.app%2Frequests%2FLAN-7%3Fview%3Dboard"))
      .toBe("https://app.uselane.app/login?redirect_url=https%3A%2F%2Fapp.uselane.app%2Frequests%2FLAN-7%3Fview%3Dboard");
    expect(at("/login/tasks/")).toBe("https://app.uselane.app/login");
  });

  it("sends each named task where the browser sends it", () => {
    expect(at("/login/tasks/choose-organization?redirect_url=%2F")).toBe("https://app.uselane.app/login?redirect_url=%2F");
    expect(at("/login/tasks/reset-password?redirect_url=%2F")).toBe("https://app.uselane.app/reset-password?redirect_url=%2F");
    expect(at("/login/tasks/setup-mfa")).toBe("https://app.uselane.app/login");
    expect(at("/login/tasks/constructor")).toBe("https://app.uselane.app/login");
  });

  it("does the same under the sign-up page, Clerk's other task base", () => {
    expect(at("/signup/tasks?redirect_url=%2F")).toBe("https://app.uselane.app/login?redirect_url=%2F");
    expect(at("/signup/tasks/reset-password")).toBe("https://app.uselane.app/reset-password");
  });

  it("leaves every other address alone", () => {
    for (const path of ["/", "/login", "/login?redirect_url=%2F", "/signup", "/reset-password", "/onboarding", "/requests/LAN-7", "/login/taskslist", "/tasks", "/requests/tasks"]) {
      expect(at(path)).toBeNull();
    }
  });
});

// Clerk's task addresses sit under the sign-in and sign-up pages, so the layout, the proxy and the task
// address all read the two pages from one place.
describe("sign-in and sign-up pages", () => {
  const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("are Lane's /login and /signup", () => {
    expect(SIGN_IN_URL).toBe("/login");
    expect(SIGN_UP_URL).toBe("/signup");
  });

  it("are what the browser's ClerkProvider and the proxy's clerkMiddleware are given", () => {
    const layout = source("src/app/layout.tsx");
    expect(layout).toContain("signInUrl={SIGN_IN_URL}");
    expect(layout).toContain("signUpUrl={SIGN_UP_URL}");
    const proxy = source("src/proxy.ts");
    expect(proxy).toContain("signInUrl: SIGN_IN_URL");
    expect(proxy).toContain("signUpUrl: SIGN_UP_URL");
    for (const file of [layout, proxy]) expect(file).not.toMatch(/["']\/(?:login|signup)["']/);
  });
});
