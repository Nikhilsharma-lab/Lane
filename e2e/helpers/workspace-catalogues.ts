import { expect, type Page, type Request, type Route } from "@playwright/test";
import type { ProjectOption } from "../../src/lib/request-properties";
import type { RequestLabel } from "../../src/lib/request-labels";

export const catalogueSurfaces = [
  { width: 1440, colorScheme: "light" }, { width: 1440, colorScheme: "dark" },
  { width: 390, colorScheme: "light" }, { width: 390, colorScheme: "dark" },
] as const;
export type CatalogueFixture = { project: ProjectOption; workspaceLabel: RequestLabel; projectLabel: RequestLabel };
type Kind = "project" | "workspaceLabel" | "projectLabel";
export type CatalogueRecorder = {
  pending: (kind: Kind, name: string, projectId: string | null) => Promise<void>;
  aborted: (kind: Kind, name: string) => Promise<void>;
  confirmed: (kind: Kind, entry: ProjectOption | RequestLabel) => Promise<void>;
};
type Capture = (name: string) => Promise<void>;
const draftTitle = "Catalogue acceptance draft stays intact";
const composer = (page: Page) => page.getByRole("dialog", { name: "New Request", exact: true });
const projects = (page: Page) => page.getByRole("dialog", { name: "Choose a Project", exact: true });
const labels = (page: Page) => page.getByRole("dialog", { name: "Labels", exact: true });

function matchesCreate(request: Request, orgId: string, name: string, projectId?: string | null) {
  if (request.method() !== "POST" || !request.headers()["next-action"]) return false;
  try {
    const args: unknown = JSON.parse(request.postData() ?? "null");
    return Array.isArray(args) && args.length === 2 && args[0]?.name === name && args[1]?.orgId === orgId &&
      (projectId === undefined ? !("colour" in args[0]) : args[0]?.projectId === projectId);
  } catch { return false; }
}

/** Read only the real action's saved entry; never log Flight bodies or headers. */
function savedEntry<T>(body: string, key: "project" | "label"): T {
  for (const line of body.split("\n")) {
    const match = /^[\da-f]+:(.+)$/.exec(line);
    if (!match) continue;
    try {
      const value = JSON.parse(match[1]);
      if (value?.success === true && value[key]?.id) return value[key] as T;
    } catch { /* Flight can include non-JSON model lines. */ }
  }
  throw new Error(`The real ${key} creation response did not contain a saved entry; inspect before any retry.`);
}

async function abortCreate(page: Page, match: (request: Request) => boolean, submit: () => Promise<void>) {
  let count = 0;
  const pattern = `${new URL(page.url()).origin}/**`;
  const handler = async (route: Route) => {
    if (!match(route.request())) return route.fallback();
    count++;
    await route.abort("failed"); // No dispatch, synthetic response or ambiguous committed save.
  };
  await page.route(pattern, handler);
  try {
    await submit();
    await expect.poll(() => count).toBe(1);
  } finally { await page.unroute(pattern, handler); }
  return { outgoingCreates: count, abortedBeforeDispatch: true };
}

export async function openCatalogueDraft(page: Page, orgId: string) {
  await page.goto("/intake");
  await expect.poll(() => page.evaluate(expectedOrg => {
    const clerk = window.Clerk;
    return Boolean(clerk?.loaded && clerk.user && clerk.session?.status === "active" && clerk.organization?.id === expectedOrg);
  }, orgId), { timeout: 30_000 }).toBe(true);
  const start = page.getByRole("button", { name: "Create Request", exact: true });
  await expect(composer(page).or(start)).toBeVisible();
  if (!await composer(page).isVisible()) await start.click();
  await composer(page).getByRole("textbox", { name: "Request title", exact: true }).fill(draftTitle);
}

export async function selectCatalogueProject(page: Page, name: string) {
  await composer(page).locator("#intake-project").press("Enter");
  const option = projects(page).getByRole("option", { name, exact: true });
  await option.focus();
  await option.press("Enter");
  await expect(projects(page)).toBeHidden();
}

export async function createCatalogueProject(page: Page, orgId: string, name: string, recorder: CatalogueRecorder, capture: Capture) {
  await composer(page).locator("#intake-project").press("Enter");
  await projects(page).getByRole("button", { name: "New Project", exact: true }).press("Enter");
  const field = projects(page).getByRole("textbox", { name: "Project name", exact: true });
  await expect(field).toBeFocused();
  await field.fill(name);
  const submit = () => projects(page).getByRole("button", { name: "Create Project", exact: true }).press("Enter");
  await recorder.pending("project", name, null);
  const failure = await abortCreate(page, request => matchesCreate(request, orgId, name), submit);
  await recorder.aborted("project", name);
  await expect(projects(page).getByText("Project could not be created. Try again; your Request is still here.", { exact: true })).toBeVisible();
  await expect(field).toHaveValue(name);
  await expect(field).toBeFocused();
  await expect(composer(page).getByRole("textbox", { name: "Request title", exact: true })).toHaveValue(draftTitle);
  await capture("project-create-failure-draft-kept");

  await recorder.pending("project", name, null);
  const response = page.waitForResponse(value => matchesCreate(value.request(), orgId, name));
  await submit();
  const result = await response;
  expect(result.ok()).toBe(true);
  const project = savedEntry<ProjectOption>(await result.text(), "project");
  await recorder.confirmed("project", project);
  expect(project.name).toBe(name);
  await expect(projects(page)).toBeHidden();
  await expect(composer(page).getByRole("button", { name: `Project: ${name}`, exact: true })).toBeVisible();
  const sidebarProject = page.locator("#lane-sidebar a").filter({ hasText: name });
  await expect(sidebarProject).toHaveCount(1);
  expect(new URL((await sidebarProject.getAttribute("href"))!, page.url()).searchParams.get("project")).toBe(project.id);
  await capture("project-create-retry-saved");
  return { project, failure };
}

async function labelColourStep(page: Page, name: string, scope: string) {
  await composer(page).locator("#intake-request-labels").press("Enter");
  const field = labels(page).getByRole("textbox", { name: "Search labels", exact: true });
  await expect(field).toBeFocused();
  await field.fill(name);
  await labels(page).getByRole("button", { name: `Create new label: “${name}”`, exact: true }).press("Enter");
  await page.getByRole("dialog", { name: "Label scope", exact: true }).getByRole("button", { name: scope, exact: true }).press("Enter");
  return page.getByRole("dialog", { name: "Label colour", exact: true });
}

export async function createCatalogueLabel(page: Page, orgId: string, name: string, project: ProjectOption | null, recorder: CatalogueRecorder, capture: Capture, failFirst = false) {
  const kind = project ? "projectLabel" : "workspaceLabel", projectId = project?.id ?? null;
  const colour = await labelColourStep(page, name, project?.name ?? "Workspace");
  const submit = () => colour.getByRole("button", { name: "Blue", exact: true }).press("Enter");
  let failure: { outgoingCreates: number; abortedBeforeDispatch: boolean } | undefined;
  if (failFirst) {
    await recorder.pending(kind, name, projectId);
    failure = await abortCreate(page, request => matchesCreate(request, orgId, name, projectId), submit);
    await recorder.aborted(kind, name);
    await expect(colour.getByRole("alert")).toHaveText("The label could not be created. Try again.");
    await expect(colour.getByText(`Pick a colour for “${name}”`, { exact: true })).toBeVisible();
    await expect(composer(page).getByRole("textbox", { name: "Request title", exact: true })).toHaveValue(draftTitle);
    await capture("label-create-failure-draft-kept");
  }
  await recorder.pending(kind, name, projectId);
  const response = page.waitForResponse(value => matchesCreate(value.request(), orgId, name, projectId));
  await submit();
  const result = await response;
  expect(result.ok()).toBe(true);
  const label = savedEntry<RequestLabel>(await result.text(), "label");
  await recorder.confirmed(kind, label);
  expect(label.name).toBe(name);
  expect(label.projectId).toBe(projectId);
  await expect(labels(page).getByRole("checkbox", { name, exact: true })).toBeChecked();
  await capture(`${kind}-created-selected`);
  await page.keyboard.press("Escape");
  await expect(labels(page)).toBeHidden();
  return { label, failure };
}

/** Real controls only: scope filtering, selected stale scope, ordering and retained draft. */
export async function verifyCataloguePickers(page: Page, orgId: string, fixture: CatalogueFixture, capture: Capture) {
  await openCatalogueDraft(page, orgId);
  await selectCatalogueProject(page, fixture.project.name);
  await composer(page).locator("#intake-request-labels").press("Enter");
  const workspace = labels(page).getByRole("checkbox", { name: fixture.workspaceLabel.name, exact: true });
  const scoped = labels(page).getByRole("checkbox", { name: fixture.projectLabel.name, exact: true });
  await expect(workspace).toHaveCount(1);
  await expect(scoped).toHaveCount(1);
  await workspace.focus(); await workspace.press("Space");
  await scoped.focus(); await scoped.press("Space");
  await expect(workspace).toBeChecked(); await expect(scoped).toBeChecked();
  await capture("labels-selected-in-project");
  await page.keyboard.press("Escape"); await expect(labels(page)).toBeHidden();
  await selectCatalogueProject(page, "No project");
  await composer(page).locator("#intake-request-labels").press("Enter");
  await expect(scoped).toBeChecked();
  await expect(labels(page).getByText("Other Project — remove to save", { exact: true })).toBeVisible();
  await scoped.focus(); await scoped.press("Space");
  await expect(scoped).toHaveCount(0);
  await expect(workspace).toBeChecked();
  await capture("project-label-hidden-after-removal");
  await page.keyboard.press("Escape"); await expect(labels(page)).toBeHidden();
  await selectCatalogueProject(page, fixture.project.name);
  await composer(page).locator("#intake-request-labels").press("Enter");
  await expect(scoped).toHaveCount(1); await expect(scoped).not.toBeChecked();
  await expect(workspace).toBeChecked();
  for (const name of ["Bug", "Improvement", "New feature"]) await expect(labels(page).getByRole("checkbox", { name, exact: true })).toHaveCount(1);
  await page.keyboard.press("Escape"); await expect(labels(page)).toBeHidden();
  await expect(composer(page).getByRole("textbox", { name: "Request title", exact: true })).toHaveValue(draftTitle);
  const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(geometry.content).toBeLessThanOrEqual(geometry.viewport);
  await capture("catalogue-controls-and-draft-kept");
}
