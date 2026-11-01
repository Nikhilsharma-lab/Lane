import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { statusLabels, withoutHidden } from "@/test/exposed-markup";

type SessionState = { isLoaded: boolean; session?: { currentTask?: { key: string } } | null };
const clerk = vi.hoisted(() => ({ session: { isLoaded: false } as SessionState, status: "loading", returnUrl: "", signIn: vi.fn() }));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(clerk.returnUrl ? { redirect_url: clerk.returnUrl } : {}) }));

// Clerk's components draw nothing without an instance; these stand-ins render
// what Lane hands them as `fallback`, which is all Lane controls while Clerk mounts.
vi.mock("@clerk/nextjs", () => {
  const withFallback = ({ fallback }: { fallback?: ReactNode }) => fallback ?? null;
  return {
    SignIn: (props: { fallback?: ReactNode }) => { clerk.signIn(props); return withFallback(props); },
    SignUp: withFallback,
    TaskChooseOrganization: withFallback,
    TaskResetPassword: withFallback,
    useSession: () => clerk.session,
    useClerk: () => ({ status: clerk.status }),
    // As Clerk's own: children only while loading, or only once loading failed.
    ClerkLoading: ({ children }: { children: ReactNode }) => clerk.status === "loading" ? children : null,
    ClerkFailed: ({ children }: { children: ReactNode }) => clerk.status === "error" ? children : null,
  };
});

const { ClerkHashSignIn, ClerkSessionTasks } = await import("./clerk-sign-in");
const { LoginResetLink } = await import("./login-reset-link");
const { HiddenDuringSessionTask } = await import("./session-task-gate");
const gatedLink = () => createElement(HiddenDuringSessionTask, null, createElement(LoginResetLink));
const { default: LoginPage } = await import("@/app/(auth)/login/page");
const { default: LoginLoading } = await import("@/app/(auth)/login/loading");
const { default: SignupPage } = await import("@/app/(auth)/signup/page");
const { default: SignupLoading } = await import("@/app/(auth)/signup/loading");

const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element).replace(/<!--.*?-->/g, "");
const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Plan item 2.11: the reset link during a Clerk session task", () => {
  beforeEach(() => { clerk.session = { isLoaded: false }; clerk.status = "loading"; });

  it("is hidden but keeps its place until Clerk can say whether a task is open", () => {
    const html = render(gatedLink());
    expect(html).toContain("data-concealed");
    expect(html).toContain('href="/forgot-password"');
  });

  it("is hidden while either session task is open", () => {
    for (const key of ["choose-organization", "reset-password"]) {
      clerk.session = { isLoaded: true, session: { currentTask: { key } } };
      expect(render(gatedLink())).toContain("data-concealed");
    }
  });

  it("shows if Clerk fails to load, since no task can be open", () => {
    clerk.status = "error";
    expect(render(gatedLink())).not.toContain("data-concealed");
  });

  it("shows once Clerk has loaded and no task is open", () => {
    clerk.session = { isLoaded: true, session: null };
    expect(render(gatedLink())).not.toContain("data-concealed");
    clerk.session = { isLoaded: true, session: {} };
    expect(render(gatedLink())).not.toContain("data-concealed");
  });
});

describe("Plan item 2.11: the card's space is reserved while Clerk loads", () => {
  beforeEach(() => { clerk.session = { isLoaded: false }; clerk.status = "loading"; });

  it("replaces the skeleton with a way out once Clerk fails to load (decision 2026-10-21)", () => {
    clerk.status = "error";
    for (const [element, title, href] of [[createElement(ClerkHashSignIn), "Sign in is unavailable right now", "/login"], [createElement(SignupPage), "Sign up is unavailable right now", "/signup"]] as const) {
      const html = render(element);
      expect(html).not.toContain('data-skeleton="auth-card"');
      expect(html).toContain(`<h1`);
      expect(html).toContain(title);
      expect(html).toMatch(new RegExp(`<a href="${href}"[^>]*>.*Reload</a>`));
    }
  });

  it("preserves the server redirect destination through the hash-routed sign-in form", () => {
    clerk.returnUrl = "http://localhost:3100/intake";
    try {
      render(createElement(ClerkHashSignIn));
      expect(clerk.signIn).toHaveBeenLastCalledWith(expect.objectContaining({ fallbackRedirectUrl: clerk.returnUrl }));
    } finally { clerk.returnUrl = ""; }
  });

  it("gives Clerk's sign-in the card skeleton as its fallback", () => {
    const html = render(createElement(ClerkHashSignIn));
    expect(html).toContain('data-skeleton="auth-card"');
    expect(statusLabels(withoutHidden(html))).toEqual(["Loading sign in"]);
  });

  it("gives each session task a fallback of its own", () => {
    clerk.session = { isLoaded: true, session: { currentTask: { key: "reset-password" } } };
    expect(statusLabels(withoutHidden(render(createElement(ClerkSessionTasks, { fallback: null }))))).toEqual(["Loading password reset"]);
    clerk.session = { isLoaded: true, session: { currentTask: { key: "choose-organization" } } };
    expect(statusLabels(withoutHidden(render(createElement(ClerkSessionTasks, { fallback: null }))))).toEqual(["Loading workspaces"]);
  });

  it("renders the login route and its loading state in one frame and card shape", () => {
    const page = render(createElement(LoginPage));
    const loading = render(createElement(LoginLoading));
    for (const html of [page, loading]) {
      expect(html).not.toContain("Sign in to access your Lane workspace.");
      expect(html).toContain('href="/forgot-password"');
      expect(html).toContain('data-skeleton="auth-card"');
      expect(statusLabels(withoutHidden(html))).toEqual(["Loading sign in"]);
    }
    // Same frame, same card: the page differs from its loading state only once Clerk mounts.
    expect(page).toBe(loading);
  });

  it("renders the signup route and its loading state in one frame and card shape", () => {
    const page = render(createElement(SignupPage));
    const loading = render(createElement(SignupLoading));
    expect(page).toContain("Create or join a workspace after signing up.");
    expect(statusLabels(withoutHidden(page))).toEqual(["Loading account creation"]);
    expect(page).toBe(loading);
  });
});

describe("Plan item 2.11: forgot and reset share one frame", () => {
  it("draws both pages through RecoveryFrame", () => {
    for (const path of ["src/app/(auth)/forgot-password/page.tsx", "src/app/(auth)/reset-password/page.tsx"]) {
      const page = source(path);
      expect(page).toContain("<RecoveryFrame headerAction={");
      expect(page).toContain("<RecoveryLoginLink />");
      expect(page).not.toContain("AuthTrust");
      expect(page).not.toContain("AuthHeaderLink");
    }
  });

  // During the forced reset task /login only resumes the task, so "Sign in" would loop back here.
  it("hides /reset-password's Sign in link while the reset task is open, as /login hides its reset link", async () => {
    const { default: ResetPasswordPage } = await import("@/app/(auth)/reset-password/page");
    clerk.status = "ready";
    clerk.session = { isLoaded: true, session: { currentTask: { key: "reset-password" } } };
    const html = render(createElement(ResetPasswordPage));
    expect(html).toMatch(/<div[^>]*data-concealed[^>]*><div[^>]*><span>Remembered it\?<\/span><a [^>]*href="\/login"[^>]*>Sign in<\/a>/);
  });

  it("spaces the recovery form with Lane's tokens rather than utilities", () => {
    const view = source("src/components/auth/password-recovery-view.tsx");
    expect(view).toContain("styles.recoveryForm");
    expect(view).toContain("styles.recoveryActions");
    expect(view).not.toMatch(/className="[^"]*\bgap-\d/);
  });
});
