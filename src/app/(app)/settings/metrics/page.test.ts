/**
 * #196: Settings → Metrics as the server renders it, with the library read from the real test database.
 * The session's workspace and role are faked; Clerk's own profile widgets are stubbed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import type { WorkspaceContext } from "@/lib/ensure-workspace";

const ORG = "org_metrics_page";
const session = vi.hoisted(() => ({ workspace: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ensure-workspace", () => ({ getWorkspace: async () => session.workspace }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`redirect:${to}`); },
  usePathname: () => "/settings/metrics",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/auth/clerk-members-profile", () => ({ ClerkMembersProfile: () => null, ClerkWorkspaceProfile: () => null }));
vi.mock("@/components/settings/account-profile", () => ({ AccountProfile: () => null, AccountSecurity: () => null }));
vi.mock("../profile/profile-form", () => ({ ProfileForm: () => null }));
vi.mock("../profile/theme-preference", () => ({ ThemePreference: () => null }));

const as = (role: WorkspaceContext["role"]): WorkspaceContext => ({ userId: `user_metrics_page_${role}`, orgId: ORG, role, profileRole: "pm", fullName: "Pat", email: "pat@example.test", workspaceName: "Metrics page" });
const open = async (section?: string) => {
  const { default: MetricsPage } = await import("./page");
  return renderToStaticMarkup(await MetricsPage({ searchParams: Promise.resolve(section ? { section } : {}) }));
};
const visibleSections = (html: string) => [...html.matchAll(/<section id="settings-([\w-]+)"([^>]*)>/g)].filter(match => !match[2].includes("hidden")).map(match => match[1]);

let connection: ReturnType<typeof postgres>;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !TEST_DATABASE_PATH.test(url.pathname)) throw new Error("Metrics page tests require disposable local PostgreSQL");
  connection = postgres(url.toString(), { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Metrics page','metrics-page')`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id = ${ORG}`;
  await connection.end();
});
beforeEach(() => { session.workspace = as("member"); });

describe("Settings → Metrics", () => {
  it.each(["member", "admin"] as const)("shows a %s the seven starter metrics with unit and how-it's-counted line", async (role) => {
    session.workspace = as(role);
    const html = await open();
    expect(visibleSections(html)).toEqual(["metrics"]);
    const names = [...html.matchAll(/<h4[^>]*>([^<]*)<\/h4>/g)].map(match => match[1]);
    expect(names).toEqual(["Action count", "Conversion rate", "Customer satisfaction", "Feature adoption rate", "Median time to convert", "Support contact rate", "User error rate"]);
    expect(html).toContain("<dd>Percentage</dd>");
    expect(html).toContain("<dd>Seconds</dd>");
    expect(html).toContain("<dd>Count</dd>");
    expect(html).toContain("Median time from starting the step to finishing it.");
    expect(html.match(/Add where this lives/g)).toHaveLength(7);
  });

  it("doesn't add the starter metrics again on a second visit", async () => {
    await open();
    const html = await open();
    expect(html.match(/<h4[^>]*>Conversion rate<\/h4>/g)).toHaveLength(1);
  });

  it("follows a section in the address, as the other Settings pages do", async () => {
    expect(visibleSections(await open("profile"))).toEqual(["profile"]);
  });

  it("keeps a guest out", async () => {
    session.workspace = as("guest");
    await expect(open()).rejects.toThrow("redirect:/");
  });

  it("sends someone signed out to sign in, and someone new to onboarding", async () => {
    session.workspace = null;
    await expect(open()).rejects.toThrow("redirect:/login");
    session.workspace = { needsOnboarding: true };
    await expect(open()).rejects.toThrow("redirect:/onboarding");
  });
});
