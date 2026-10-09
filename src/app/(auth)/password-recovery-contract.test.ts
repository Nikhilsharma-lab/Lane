import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const FORGOT = source("src/app/(auth)/forgot-password/page.tsx");
const RESET = source("src/app/(auth)/reset-password/page.tsx");
const LOGIN = source("src/app/(auth)/login/page.tsx");
const FORM = source("src/components/auth/password-recovery-form.tsx");
const CLERK_SIGN_IN = source("src/components/auth/clerk-sign-in.tsx");
const LAYOUT = source("src/app/layout.tsx");

describe("Clerk password recovery and invitation return", () => {
  it("keeps /forgot-password on Clerk recovery instead of bouncing to login", () => {
    expect(FORGOT).not.toMatch(/redirect\(\s*["']\/login["']\s*\)/);
    expect(FORGOT).not.toContain("SignIn");
    expect(FORGOT).toContain("PasswordRecoveryForm");
    expect(FORM).toContain('from "@clerk/nextjs/legacy"');
    expect(FORM).toContain("useSignIn");
    // Strategy, retry and continuation behavior is exercised in the flow tests.
    expect(FORM).toContain("createPasswordRecoveryFlow");
    expect(LOGIN).toContain('href="/forgot-password"');
  });

  it("keeps /reset-password on Clerk's reset-password task", () => {
    expect(RESET).not.toMatch(/redirect\(\s*["']\/login["']\s*\)/);
    expect(RESET).toContain("ClerkSessionTasks");
    expect(RESET).toContain("PasswordRecoveryForm");
    expect(CLERK_SIGN_IN).toContain("TaskResetPassword");
    expect(CLERK_SIGN_IN).toContain('"reset-password"');
  });

  it("resumes a reset-password session task on /login", () => {
    expect(LOGIN).toContain("ClerkSessionTasks");
    expect(CLERK_SIGN_IN).toContain("TaskResetPassword");
    expect(CLERK_SIGN_IN).toContain('"reset-password"');
  });

  it("tells Clerk which Lane origins and reset-password path may complete hosted redirects", () => {
    expect(LAYOUT).toContain("allowedRedirectOrigins");
    expect(LAYOUT).toContain("https://lane-staging.vercel.app");
    expect(LAYOUT).toContain('"reset-password": "/reset-password"');
  });
});
