/**
 * #197: one Metric definition's page under Settings → Metrics, as the server renders it, with the library
 * read from the real test database. The session's workspace and role are faked; Clerk's widgets are stubbed.
 */
import { renderToStaticMarkup } from "react-dom/server";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import type { WorkspaceContext } from "@/lib/ensure-workspace";

const ORG = "org_metric_definition_page", OTHER = "org_metric_definition_other";
const PAT = "user_metric_page_pat", SAM = "user_metric_page_sam";
const session = vi.hoisted(() => ({ workspace: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/ensure-workspace", () => ({ getWorkspace: async () => session.workspace }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => { throw new Error(`redirect:${to}`); },
  notFound: () => { throw new Error("not-found"); },
  usePathname: () => "/settings/metrics/x",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/auth/clerk-members-profile", () => ({ ClerkMembersProfile: () => null, ClerkWorkspaceProfile: () => null }));
vi.mock("@/components/settings/account-profile", () => ({ AccountProfile: () => null, AccountSecurity: () => null }));
vi.mock("../../profile/profile-form", () => ({ ProfileForm: () => null }));
vi.mock("../../profile/theme-preference", () => ({ ThemePreference: () => null }));

const as = (role: WorkspaceContext["role"]): WorkspaceContext => ({ userId: PAT, orgId: ORG, role, profileRole: "pm", fullName: "Pat", email: "pat@example.test", workspaceName: "Metric page" });
const open = async (id: string) => {
  const { default: MetricDefinitionPage } = await import("./page");
  return renderToStaticMarkup(await MetricDefinitionPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) }));
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const historyOf = (html: string) => /<ol[^>]*aria-label="Changes to this metric"[^>]*>([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? "";
const library = () => import("@/lib/metrics-library");

let connection: ReturnType<typeof postgres>;
let trials = "";
beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !TEST_DATABASE_PATH.test(url.pathname)) throw new Error("Metric definition page tests require disposable local PostgreSQL");
  connection = postgres(url.toString(), { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Metric page','metric-page'),(${OTHER},'Other','metric-page-other')`;
  await connection`insert into profiles (id,full_name,email) values (${PAT},'Pat Lee','pat-metric@example.test'),(${SAM},'Sam Ortiz','sam-metric@example.test')`;
  const { addMetricDefinition, editMetricDefinition } = await library();
  const added = await addMetricDefinition({ orgId: ORG }, PAT, { name: "Trial starts", unit: "count", link: null, howCounted: "Trials started per week." });
  if (!("id" in added)) throw new Error(added.error);
  trials = added.id;
  await editMetricDefinition({ orgId: ORG }, SAM, trials, { name: "Trials started", unit: "count", link: "https://analytics.example.test/trials", howCounted: "Trials started per week." });
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG},${OTHER})`;
  await connection`delete from profiles where id in (${PAT},${SAM})`;
  await connection.end();
});
beforeEach(() => { session.workspace = as("member"); });

describe("A Metric definition's page", () => {
  it("shows a Member the edit form with the definition's current values", async () => {
    const html = await open(trials);
    expect(html).toMatch(/<h3[^>]*>Trials started<\/h3>/);
    expect(html).toMatch(/<input[^>]*value="Trials started"/);
    expect(html).toMatch(/<input[^>]*value="https:\/\/analytics.example.test\/trials"/);
    expect(html).toContain("Trials started per week.</textarea>");
    expect(text(html)).toContain("Unit");
    expect(text(html)).toContain("Count");
    expect(text(html)).toContain("Save changes");
  });

  it("explains that a change in what's counted needs a new definition", async () => {
    expect(text(await open(trials))).toContain("If what's counted changes, add a new metric instead, so results already measured keep their meaning.");
  });

  it("shows every change in history, newest first, with who made it and the before and after", async () => {
    const history = text(historyOf(await open(trials)));
    expect(history).toMatch(/^Edited by Sam Ortiz .*Name changed from Trial starts to Trials started .*Where it lives added: https:\/\/analytics.example.test\/trials .*Added by Pat Lee .*Name: Trial starts .*Unit: Count .*How it's counted: Trials started per week\.$/);
    expect(history).not.toContain("How it's counted changed");
    expect(historyOf(await open(trials))).toMatch(/<time dateTime="[^"]+"/);
  });

  it("hides archive and restore from a Member", async () => {
    const html = text(await open(trials));
    expect(html).not.toContain("Archive metric");
    expect(html).not.toContain("Restore metric");
  });

  it("offers an Admin archive, and restore once archived", async () => {
    session.workspace = as("admin");
    expect(text(await open(trials))).toContain("Archive metric");
    const { archiveMetricDefinition, restoreMetricDefinition } = await library();
    await archiveMetricDefinition({ orgId: ORG }, PAT, trials);
    try {
      const html = text(await open(trials));
      expect(html).toContain("Restore metric");
      expect(html).not.toContain("Archive metric");
      expect(html).toContain("Archived. It isn't offered for new predictions, and stays on the Requests that already use it.");
      expect(text(historyOf(await open(trials)))).toMatch(/^Archived by Pat Lee/);
    } finally {
      await restoreMetricDefinition({ orgId: ORG }, PAT, trials);
    }
  });

  it("says a starter metric was added by Lane", async () => {
    const [conversion] = (await (await library()).listMetricDefinitions({ orgId: ORG })).filter(definition => definition.name === "Conversion rate");
    const history = text(historyOf(await open(conversion.id)));
    expect(history).toMatch(/^Added by Lane .*Name: Conversion rate .*Unit: Percentage/);
  });

  it("keeps a Guest out", async () => {
    session.workspace = as("guest");
    await expect(open(trials)).rejects.toThrow("redirect:/");
  });

  it("finds nothing for another workspace's definition or a made-up id", async () => {
    const [theirs] = await (await library()).listMetricDefinitions({ orgId: OTHER });
    await expect(open(theirs.id)).rejects.toThrow("not-found");
    await expect(open("not-a-definition")).rejects.toThrow("not-found");
  });
});
