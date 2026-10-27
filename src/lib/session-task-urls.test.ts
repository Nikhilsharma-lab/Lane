import { describe, expect, it } from "vitest";

import { sessionTaskRedirect } from "./session-task-urls";

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
