import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { statusLabels, withoutHidden } from "@/test/exposed-markup";

type SessionState = { isLoaded: boolean; session?: { currentTask?: { key: string } } | null };
const clerk = vi.hoisted(() => ({ session: { isLoaded: false } as SessionState }));

// Clerk's components draw nothing without an instance; these stand-ins render
// what Lane hands them as `fallback`, which is all Lane controls while Clerk mounts.
vi.mock("@clerk/nextjs", () => {
  const withFallback = ({ fallback }: { fallback?: ReactNode }) => fallback ?? null;
  return {
    SignIn: withFallback,
    SignUp: withFallback,
    TaskChooseOrganization: withFallback,
    TaskResetPassword: withFallback,
    useSession: () => clerk.session,
  };
});

const { ClerkHashSignIn, ClerkSessionTasks, SignInResetLink } = await import("./clerk-sign-in");
const { default: LoginPage } = await import("@/app/(auth)/login/page");
const { default: LoginLoading } = await import("@/app/(auth)/login/loading");
const { default: SignupPage } = await import("@/app/(auth)/signup/page");
const { default: SignupLoading } = await import("@/app/(auth)/signup/loading");

const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);
const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Plan item 2.11: the reset link during a Clerk session task", () => {
  beforeEach(() => { clerk.session = { isLoaded: false }; });

  it("is hidden but keeps its place until Clerk can say whether a task is open", () => {
    const html = render(createElement(SignInResetLink));
    expect(html).toContain("data-concealed");
    expect(html).toContain('href="/forgot-password"');
  });

  it("is hidden while either session task is open", () => {
    for (const key of ["choose-organization", "reset-password"]) {
      clerk.session = { isLoaded: true, session: { currentTask: { key } } };
      expect(render(createElement(SignInResetLink))).toContain("data-concealed");
    }
  });

  it("shows once Clerk has loaded and no task is open", () => {
    clerk.session = { isLoaded: true, session: null };
    expect(render(createElement(SignInResetLink))).not.toContain("data-concealed");
    clerk.session = { isLoaded: true, session: {} };
    expect(render(createElement(SignInResetLink))).not.toContain("data-concealed");
  });
});

describe("Plan item 2.11: the card's space is reserved while Clerk loads", () => {
  beforeEach(() => { clerk.session = { isLoaded: false }; });

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
      expect(html).toContain("Sign in to access your Lane workspace.");
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
      expect(page).toContain("<RecoveryFrame>");
      expect(page).not.toContain("AuthTrust");
      expect(page).not.toContain("AuthHeaderLink");
    }
  });

  it("spaces the recovery form with Lane's tokens rather than utilities", () => {
    const view = source("src/components/auth/password-recovery-view.tsx");
    expect(view).toContain("styles.recoveryForm");
    expect(view).toContain("styles.recoveryActions");
    expect(view).not.toMatch(/className="[^"]*\bgap-\d/);
  });
});
