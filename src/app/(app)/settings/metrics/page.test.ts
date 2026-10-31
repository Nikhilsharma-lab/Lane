/**
 * #196: Settings → Metrics as the server renders it, with the library read from the real test database.
 * The session's workspace and role are faked; Clerk's own profile widgets are stubbed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";
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
vi.mock("@/components/settings/workspace-members-loader", () => ({ WorkspaceMembersLoader: () => null }));
vi.mock("@/components/settings/account-profile", () => ({ AccountProfile: () => null, AccountSecurity: () => null }));
vi.mock("../profile/profile-form", () => ({ ProfileForm: () => null }));
vi.mock("../profile/theme-preference", () => ({ ThemePreference: () => null }));

const as = (role: WorkspaceContext["role"]): WorkspaceContext => ({ userId: `user_metrics_page_${role}`, orgId: ORG, role, profileRole: "pm", fullName: "Pat", email: "pat@example.test", workspaceName: "Metrics page" });
const open = async (section?: string) => {
  const { default: MetricsPage } = await import("./page");
  return renderToStaticMarkup(await MetricsPage({ searchParams: Promise.resolve(section ? { section } : {}) }));
};
const openArchived = async () => {
  const { default: MetricsPage } = await import("./page");
  return renderToStaticMarkup(await MetricsPage({ searchParams: Promise.resolve({ show: "archived" }) }));
};
const visibleSections = (html: string) => [...html.matchAll(/<section id="settings-([\w-]+)"([^>]*)>/g)].filter(match => !match[2].includes("hidden")).map(match => match[1]);

let connection: ReturnType<typeof postgres>;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(url.toString(), { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Metrics page','metrics-page')`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id = 'user_metrics_page_archiver'`;
  await connection.end();
});
beforeEach(() => { session.workspace = as("member"); });

describe("Settings → Metrics", () => {
  it.each(["member", "admin"] as const)("shows a %s the seven starter metrics with unit and how-it's-counted line", async (role) => {
    session.workspace = as(role);
    const html = await open();
    expect(visibleSections(html)).toEqual(["metrics"]);
    const names = [...html.matchAll(/<h4[^>]*><a[^>]*>([^<]*)<\/a><\/h4>/g)].map(match => match[1]);
    expect(names).toEqual(["Action count", "Conversion rate", "Customer satisfaction", "Feature adoption rate", "Median time to convert", "Support contact rate", "User error rate"]);
    expect(html).toMatch(/<span[^>]*>Percentage<\/span>/);
    expect(html).toMatch(/<span[^>]*>Seconds<\/span>/);
    expect(html).toMatch(/<span[^>]*>Count<\/span>/);
    expect(html).toContain("Median time from starting the step to finishing it.");
    expect(html.match(/Add source/g)).toHaveLength(7);
  });

  it("doesn't add the starter metrics again on a second visit", async () => {
    await open();
    const html = await open();
    expect(html.match(/<h4[^>]*><a[^>]*>Conversion rate<\/a><\/h4>/g)).toHaveLength(1);
  });

  it("follows a section in the address, as the other Settings pages do", async () => {
    expect(visibleSections(await open("profile"))).toEqual(["profile"]);
  });

  it.each(["member", "admin"] as const)("offers a %s 'Add metric', and opens each definition from its name (#197)", async (role) => {
    session.workspace = as(role);
    const html = await open();
    expect(html).toMatch(/<button[^>]*>[\s\S]*?Add metric[\s\S]*?<\/button>/);
    expect(html).toMatch(/<h4[^>]*><a[^>]*href="\/settings\/metrics\/[0-9a-f-]{36}"[^>]*>Conversion rate<\/a><\/h4>/);
    expect(html).toMatch(/<a[^>]*href="\/settings\/metrics\/[0-9a-f-]{36}"[^>]*>Add source<span/);
  });

  it("keeps archived definitions behind the Archived filter (#197)", async () => {
    const { listMetricDefinitions, archiveMetricDefinition } = await import("@/lib/metrics-library");
    await connection`insert into profiles (id,full_name,email) values ('user_metrics_page_archiver','Archiver','archiver@example.test') on conflict do nothing`;
    const action = (await listMetricDefinitions({ orgId: ORG })).find(definition => definition.name === "Action count")!;
    await archiveMetricDefinition({ orgId: ORG }, "user_metrics_page_archiver", action.id);
    const names = (html: string) => [...html.matchAll(/<h4[^>]*>(?:<a[^>]*>)?([^<]*)/g)].map(match => match[1]);
    const shown = await open();
    expect(names(shown)).not.toContain("Action count");
    expect(names(shown)).toContain("Conversion rate");
    expect(shown).toContain('aria-label="Show metrics"');
    const archived = await openArchived();
    expect(names(archived)).toEqual(["Action count"]);
  });

  it("explains an empty Archived view (#197)", async () => {
    await connection`insert into organizations (id,name,slug) values ('org_metrics_page_empty','Empty','metrics-page-empty') on conflict do nothing`;
    session.workspace = { ...as("member"), orgId: "org_metrics_page_empty" };
    const html = await openArchived();
    expect(html).toContain("No archived metrics");
    await connection`delete from organizations where id = 'org_metrics_page_empty'`;
  });

  // #210: a Viewer reads the Metrics library and changes nothing in it.
  it("shows a Viewer every definition with nothing to add or edit, and no Members section", async () => {
    session.workspace = as("viewer");
    const html = await open();
    expect(visibleSections(html)).toEqual(["metrics"]);
    expect(html).toMatch(/<h4[^>]*><a[^>]*href="\/settings\/metrics\/[0-9a-f-]{36}"[^>]*>Conversion rate<\/a><\/h4>/);
    expect(html).not.toMatch(/<button[^>]*>[\s\S]*?Add metric[\s\S]*?<\/button>/);
    expect(html).not.toContain("Add source");
    expect(html).toContain("Median time from starting the step to finishing it.");
    expect(html).not.toContain('id="settings-members"');
    expect(html).not.toContain('id="settings-inbox-delivery"');
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
