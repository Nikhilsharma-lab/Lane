/**
 * #197: one Metric definition's page under Settings → Metrics, as the server renders it, with the library
 * read from the real test database. The session's workspace and role are faked; Clerk's widgets are stubbed.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
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
vi.mock("@/components/settings/workspace-members-loader", () => ({ WorkspaceMembersLoader: () => null }));
vi.mock("@/components/settings/account-profile", () => ({ AccountProfile: () => null, AccountSecurity: () => null }));
vi.mock("../../profile/profile-form", () => ({ ProfileForm: () => null }));
vi.mock("../../profile/theme-preference", () => ({ ThemePreference: () => null }));

const as = (role: WorkspaceContext["role"]): WorkspaceContext => ({ userId: PAT, orgId: ORG, role, profileRole: "pm", fullName: "Pat", email: "pat@example.test", workspaceName: "Metric page" });
const open = async (id: string) => {
  const { default: MetricDefinitionPage } = await import("./page");
  // The app's root layout provides the toast stack.
  return renderToStaticMarkup(createElement(ToastStackProvider, null, await MetricDefinitionPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve({}) })));
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

  // #210: a Viewer reads the definition, its uses and its history, and is offered nothing that changes it.
  it("shows a Viewer the definition read-only, with its uses and history", async () => {
    session.workspace = as("viewer");
    const html = await open(trials);
    expect(html).toMatch(/<h3[^>]*>Trials started<\/h3>/);
    expect(html).not.toMatch(/<input[^>]*value="Trials started"/);
    expect(text(html)).not.toContain("Save changes");
    expect(text(html)).toContain("Count");
    expect(text(html)).toContain("Trials started per week.");
    expect(html).toContain('href="https://analytics.example.test/trials"');
    expect(text(html)).toContain("Requests that used it");
    expect(historyOf(html)).not.toBe("");
    expect(text(html)).not.toContain("Archive metric");
    expect(text(html)).not.toContain("Merge");
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
      expect(html).toContain("Archived. It isn't offered for new goals, and stays on the Requests that already use it.");
      expect(text(historyOf(await open(trials)))).toMatch(/^Archived by Pat Lee/);
    } finally {
      await restoreMetricDefinition({ orgId: ORG }, PAT, trials);
    }
  });

  it("hides merging from a Member", async () => {
    const html = text(await open(trials));
    expect(html).not.toContain("Merge with");
    expect(html).not.toContain("Review merge");
  });

  it("offers an Admin a merge with any other metric in the same unit, and the choice of which is kept", async () => {
    session.workspace = as("admin");
    const html = await open(trials);
    expect(text(html)).toContain("If another metric counts the same thing in the same unit, merge the two so their results add up together. Merging can't be undone.");
    // The Select lists same-unit metrics only (a count starter, not a percentage one); its options render when it opens.
    expect(html).toMatch(/<label for="[^"]+">Merge with<\/label>/);
    expect(text(html)).toContain("Review merge");
    expect(text(html)).toContain("Choose the metric to merge with, then which one to keep.");
  });

  it("tells an Admin when no other metric shares the unit", async () => {
    session.workspace = as("admin");
    const added = await (await library()).addMetricDefinition({ orgId: ORG }, PAT, { name: "Time on task", unit: "minutes", link: null, howCounted: null });
    if (!("id" in added)) throw new Error(added.error);
    const html = text(await open(added.id));
    expect(html).toContain("No other metric is counted in minutes, so there's nothing to merge it with.");
    expect(html).not.toContain("Review merge");
  });

  it("shows a merged-away definition as merged into the kept one, with a link to it, and offers nothing to change", async () => {
    session.workspace = as("admin");
    const { addMetricDefinition, mergeMetricDefinitions } = await library();
    const kept = await addMetricDefinition({ orgId: ORG }, PAT, { name: "Demo bookings", unit: "count", link: null, howCounted: null });
    const merged = await addMetricDefinition({ orgId: ORG }, PAT, { name: "Demos booked", unit: "count", link: null, howCounted: null });
    if (!("id" in kept) || !("id" in merged)) throw new Error("add refused");
    expect(await mergeMetricDefinitions({ orgId: ORG }, SAM, { keptId: kept.id, mergedId: merged.id })).toEqual({ changed: true });

    const away = await open(merged.id);
    expect(text(away)).toMatch(/Merged into Demo bookings ?\. Requests that used it now count under that one\./);
    expect(away).toContain(`href="/settings/metrics/${kept.id}"`);
    for (const offer of ["Save changes", "Archive metric", "Review merge"]) expect(text(away)).not.toContain(offer);
    expect(text(historyOf(away))).toMatch(/^Merged into Demo bookings by Sam Ortiz /);

    expect(text(historyOf(await open(kept.id)))).toMatch(/^Demos booked merged into this one by Sam Ortiz /);
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
