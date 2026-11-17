import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SessionState = { isLoaded: boolean; session?: { currentTask?: { key: string } } | null };
const clerk = vi.hoisted(() => ({ session: { isLoaded: false } as SessionState }));

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@clerk/nextjs", () => ({
  SignIn: () => null,
  TaskChooseOrganization: () => null,
  TaskResetPassword: () => null,
  ClerkLoading: () => null,
  ClerkFailed: () => null,
  useSession: () => clerk.session,
  useClerk: () => ({ status: "ready", signOut: vi.fn() }),
}));

const { default: LoginPage } = await import("@/app/(auth)/login/page");
const render = () => renderToStaticMarkup(createElement(LoginPage));
const header = (html: string) => /<header[^>]*>(.*?)<\/header>/.exec(html)?.[1] ?? "";

// #289 D8: the create-workspace step on /login offers Lane's "Wrong account? Sign out" in the header, as the role
// step after it does; Clerk's own "Signed in as … Sign out" is hidden in the card (clerkWorkspaceTaskAppearance).
describe("/login's header during Clerk's create-workspace step", () => {
  beforeEach(() => { clerk.session = { isLoaded: false }; });

  it("offers Wrong account? Sign out while the workspace step is open", () => {
    clerk.session = { isLoaded: true, session: { currentTask: { key: "choose-organization" } } };
    const html = header(render());
    expect(html).toContain("Wrong account?");
    expect(html).toMatch(/<button[^>]*>Sign out<\/button>/);
  });

  it("offers nothing before Clerk has loaded, when signed out, or during the password-reset step", () => {
    for (const session of [{ isLoaded: false }, { isLoaded: true, session: null }, { isLoaded: true, session: { currentTask: { key: "reset-password" } } }]) {
      clerk.session = session;
      expect(header(render())).not.toContain("Sign out");
    }
  });
});
