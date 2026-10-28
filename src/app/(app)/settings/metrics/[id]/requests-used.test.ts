/**
 * #203: a Metric definition's page lists the Requests that used it, as the server renders it, with the Requests read
 * from the real test database. The session's workspace and role are faked; Clerk's own profile widgets are stubbed.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";
import type { WorkspaceContext } from "@/lib/ensure-workspace";

const ORG = "org_metric_definition_uses_page";
const USER = "user_metric_definition_uses_page";
const session = vi.hoisted(() => ({ workspace: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ensure-workspace", () => ({ getWorkspace: async () => session.workspace }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`redirect:${to}`); },
  notFound: () => { throw new Error("not found"); },
  usePathname: () => "/settings/metrics",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/auth/clerk-members-profile", () => ({ ClerkMembersProfile: () => null, ClerkWorkspaceProfile: () => null }));
vi.mock("@/components/settings/workspace-members-loader", () => ({ WorkspaceMembersLoader: () => null }));
vi.mock("@/components/settings/account-profile", () => ({ AccountProfile: () => null, AccountSecurity: () => null }));
vi.mock("../../profile/profile-form", () => ({ ProfileForm: () => null }));
vi.mock("../../profile/theme-preference", () => ({ ThemePreference: () => null }));

const as = (role: WorkspaceContext["role"]): WorkspaceContext => ({ userId: USER, orgId: ORG, role, profileRole: "pm", fullName: "Pat", email: "pat@example.test", workspaceName: "Metric page" });
const open = async (id: string) => {
  const { default: MetricDefinitionPage } = await import("./page");
  // The app's root layout provides the toast stack.
  return renderToStaticMarkup(createElement(ToastStackProvider, null, await MetricDefinitionPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })));
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const measurement = { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" };
const v5 = (definitionId: string, name: string) => ({
  kind: "measurement", version: 5, measurement, guardrails: [],
  primary: { key: "definition", definitionId, name, unit: "count", current: 100, target: 150, noBaseline: false, check: "" },
});

let connection: ReturnType<typeof postgres>;
let kept: string, merged: string, unused: string;
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(url.toString(), { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Metric page','metric-definition-uses-page')`;
  await connection`insert into profiles (id,full_name,email) values (${USER},'Pat','metric-definition-uses-page@example.test')`;
  const define = async (name: string) => (await connection`insert into metric_definitions (org_id,name,unit,created_by) values (${ORG},${name},'count',${USER}) returning id`)[0].id as string;
  [kept, merged, unused] = [await define("Trials started"), await define("Trial starts"), await define("Unused")];
  const [growth] = await connection`insert into projects (org_id,name,created_by) values (${ORG},'Growth',${USER}) returning id`;
  await connection`insert into requests (org_id,title,description,created_by,project_id,expected_impact) values
    (${ORG},'Shorter trial form','Fixture',${USER},${growth.id},${connection.json(v5(kept, "Trials started") as never)}),
    (${ORG},'Trial reminder email','Fixture',${USER},null,${connection.json(v5(merged, "Trial starts") as never)})`;
  const { mergeMetricDefinitions } = await import("@/lib/metrics-library");
  const merging = await mergeMetricDefinitions({ orgId: ORG }, USER, { keptId: kept, mergedId: merged });
  if (!("changed" in merging)) throw new Error(merging.error);
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id = ${USER}`;
  await connection.end();
});
beforeEach(() => { session.workspace = as("member"); });

describe("A Metric definition's page: Requests that used it", () => {
  it.each(["member", "admin"] as const)("shows a %s every Request that used it, by Project, a merged definition's included", async (role) => {
    session.workspace = as(role);
    const html = await open(kept);
    expect(html).toContain("Requests that used it");
    expect(html).toContain('aria-label="Growth, as the main metric"');
    expect(html).toContain('aria-label="No Project, as the main metric"');
    expect(text(html)).toContain("Shorter trial form");
    expect(text(html)).toContain("Trial reminder email");
    expect(text(html)).toContain("Actual Still due (not released yet)");
  });

  it("lists nothing on a merged definition's page, which links to the metric its Requests now count under", async () => {
    const html = await open(merged);
    expect(text(html)).toMatch(/Merged into Trials started ?\. Requests that used it now count under that one\./);
    expect(html).toMatch(new RegExp(`<a[^>]*href="/settings/metrics/${kept}"[^>]*>Trials started</a>`));
    expect(html).not.toContain("Requests that used it</h3>");
    expect(html).not.toContain("Trial reminder email");
  });

  it("says so when no Request has used it yet", async () => {
    expect(text(await open(unused))).toContain("No Requests have used this metric yet");
  });

  it("keeps a guest out", async () => {
    session.workspace = as("guest");
    await expect(open(kept)).rejects.toThrow("redirect:/");
  });
});
