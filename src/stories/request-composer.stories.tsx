import { listProjects, createProject } from "@/app/(app)/intake/project-actions";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { clearUnfinishedUploads, readUnfinishedUploads, writeUnfinishedUploads } from "@/lib/unfinished-uploads";
import { getRouter, usePathname } from "@storybook/nextjs-vite/navigation.mock";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";

import { runTriage, saveRequest } from "@/app/(app)/intake/actions";
import { prepareAttachmentUpload, finalizeAttachmentUpload, discardAttachmentUpload } from "@/app/(app)/intake/attachment-actions";
import { useEffect, useState } from "react";
import { RequestWorkspaceKeyboard } from "@/app/(app)/request-workspace-keyboard";
import { RequestsOverview } from "@/app/(app)/requests-overview";
import { NewRequestLink, NewRequestProvider, preloadComposer } from "@/components/requests/new-request-provider";
import { IntakeLauncher } from "@/components/requests/intake-launcher";
import { RequestListViewProvider, useSetRequestListView, withListContext } from "@/components/requests/list-view-state";
import { PendingMutationsProvider } from "@/components/requests/pending-mutations-provider";
import type { OverviewRequest } from "@/lib/request-overview";
import { WorkspaceSidebarFixture } from "./helpers/workspace-sidebar-fixture";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import { clearIntakeDraft, intakeDraftScope, readIntakeDraft, writeIntakeDraft } from "@/lib/intake-draft";
import { fillMetricImpact, measurementImpact, metricImpact } from "./fixtures/request-impact";
import { WorkspaceProjectsProvider, useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider";
import { MeasurementPlanFields } from "@/components/requests/measurement-plan-fields";
import { EMPTY_METRIC_IMPACT } from "@/lib/request-impact";
import { assertWorkspaceCanSwitch } from "@/lib/workspace-switch-guard";

const context = { orgId: "storybook-composer-workspace" };
const draftOwnerId = "storybook-composer-person";
const requestId = "00000000-0000-4000-8000-000000000123";
const profileNavigation = fn();
const source = {
  title: "Customers cannot find their saved drafts",
  description: "Customers leave the editor and cannot find the draft when they return.",
};

function ComposerFixture() {
  return (
    <NewRequestProvider context={context} draftOwnerId={draftOwnerId}>
      <main className="space-y-6 p-6">
        <h1>Requests</h1>
        <NewRequestLink>New Request</NewRequestLink>
        <a href="/settings/profile" onClick={(event) => { event.preventDefault(); profileNavigation(); }}>Profile navigation fixture</a>
        <Input label="Filter existing Requests" placeholder="Filter Requests…" />
        <p>Existing workspace Requests remain here while you compose.</p>
        <RequestWorkspaceKeyboard selectedRequestId="existing-request" returnHref="/" />
        <Dialog>
          <DialogTrigger asChild><Button variant="secondary">Open another dialog</Button></DialogTrigger>
          <DialogContent title="Another dialog">
            <DialogClose asChild><Button variant="secondary">Return to Requests</Button></DialogClose>
          </DialogContent>
        </Dialog>
      </main>
    </NewRequestProvider>
  );
}

function SharedProjectOptions() {
  const projects = useSharedWorkspaceProjects();
  return <output aria-label="Shared Project options">{projects?.projects.map((project) => project.name).join(", ")}</output>;
}

const meta = {
  title: "Requests/New Request composer",
  component: ComposerFixture,
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/", query: {} } },
  },
  decorators: [(Story) => <ToastStackProvider><Story /><ToastStack /></ToastStackProvider>],
  beforeEach: async () => {
    // Production preloads the form on idle after the layout mounts (plan item
    // 2.3), so C renders it in the same commit as the dialog.
    await preloadComposer();
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [{ id: "00000000-0000-4000-8000-000000000456", name: "Website", description: null }] });
    mocked(createProject).mockReset().mockResolvedValue({ success: true, project: { id: "00000000-0000-4000-8000-000000000789", name: "Marketing", description: null } });
    getRouter().push.mockClear();
    getRouter().refresh.mockClear();
    profileNavigation.mockClear();
    clearIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId));
    // A story that leaves uploads unfinished leaves this tab's record (plan item 2.3, S3).
    clearUnfinishedUploads(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId));
    window.sessionStorage.removeItem("lane:request-return-focus");
    mocked(runTriage).mockReset().mockResolvedValue({
      success: true,
      triage: { classification: "problem", reframedProblem: null, extractedSolution: null },
      token: "story-composer-review-token",
    });
    mocked(saveRequest).mockReset().mockResolvedValue({ success: true, requestId });
    mocked(prepareAttachmentUpload).mockReset().mockResolvedValue({
      success: false,
      error: { code: "storage_unavailable", message: "The file did not finish uploading. Your Request was created. Retry the upload." },
    });
    mocked(finalizeAttachmentUpload).mockReset().mockResolvedValue({ success: true });
    mocked(discardAttachmentUpload).mockReset().mockResolvedValue({ success: true });
  },
} satisfies Meta<typeof ComposerFixture>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openComposer(canvasElement: HTMLElement, expectCompose = true) {
  const canvas = within(canvasElement);
  const triggers = canvas.getAllByRole("link", { name: "New Request" });
  const trigger = triggers[triggers.length - 1];
  await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
  await userEvent.click(trigger);
  const page = within(canvasElement.ownerDocument.body);
  const dialog = await page.findByRole("dialog", { name: "New Request" });
  await waitFor(() => expect(dialog).toBeVisible());
  const composer = within(dialog);
  if (expectCompose) await composer.findByRole("textbox", { name: "Request title" }, { timeout: 5000 });
  return { page, dialog, composer, trigger };
}

async function fillComposer(composer: ReturnType<typeof within>) {
  await userEvent.type(composer.getByRole("textbox", { name: "Request title" }), source.title);
  await userEvent.type(composer.getByRole("textbox", { name: "Description" }), source.description);
  await fillMetricImpact(composer);
}

async function waitForInteractive(element: HTMLElement) {
  await waitFor(() => expect(getComputedStyle(element).pointerEvents).not.toBe("none"));
}

async function projectSurface(page: ReturnType<typeof within>) {
  const surface = await page.findByRole("dialog", { name: "Choose a Project" });
  await expect(page.getAllByRole("dialog", { name: "Choose a Project" })).toHaveLength(1);
  await waitFor(() => expect(within(surface).getByRole("button", { name: "New Project" })).toBeVisible());
  return within(surface);
}

/** Every element any mutation added, so a status that mounts and unmounts between two checks is still seen. */
function recordAdded(selector: string) {
  const seen: Element[] = [];
  const observer = new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches(selector)) seen.push(node);
      seen.push(...node.querySelectorAll(selector));
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return { seen, stop: () => observer.disconnect() };
}

export const Open: Story = {
  play: async ({ canvasElement }) => {
    // Plan item 2.3: once preloaded, the first open renders the form at once,
    // with the title focused and no "Loading New Request" status in between.
    await waitFor(() => expect(canvasElement.ownerDocument.querySelector('[data-composer-ready="true"]')).not.toBeNull());
    const loading = recordAdded('[role="status"][aria-label="Loading New Request"]');
    let opened;
    try { opened = await openComposer(canvasElement); } finally { loading.stop(); }
    const { composer, dialog } = opened;
    await expect(loading.seen).toHaveLength(0);
    await waitFor(() => expect(composer.getByRole("textbox", { name: "Request title" })).toHaveFocus());
    // One stable dialog name, the shared token-height strip, and an accessible description.
    await expect(within(dialog).getByRole("heading", { name: "New Request" })).toBeVisible();
    await expect(dialog).toHaveAccessibleDescription("Describe your Request and the result you expect.");
    // The centred composer dialog (2026-10-13), not a drawer at the edge. Geometry is read once its entrance settles.
    await expect(dialog).toHaveAttribute("data-layout", "composer");
    await waitFor(() => expect(getComputedStyle(dialog).transform).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/));
    const box = dialog.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    await waitFor(() => {
      const settled = dialog.getBoundingClientRect();
      expect(Math.abs(settled.left - (viewport - settled.right))).toBeLessThanOrEqual(1);
    });
    await expect(box.left).toBeGreaterThan(0);
    const header = within(dialog).getByRole("heading", { name: "New Request" }).parentElement!.parentElement!;
    await expect(header.offsetHeight).toBe(Number.parseFloat(getComputedStyle(header).minHeight));
    await expect(composer.getByRole("textbox", { name: "Description" })).toBeVisible();
    await expect(composer.getByRole("button", { name: "Review Request" })).toBeEnabled();
    await expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(window.innerWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
    // The strip title, the fields and the footer share one edge: 24px, or 16px on phones.
    const edge = (element: Element) => element.getBoundingClientRect().left - dialog.getBoundingClientRect().left - dialog.clientLeft;
    const stripTitle = within(dialog).getByRole("heading", { name: "New Request" });
    const titleField = composer.getByRole("textbox", { name: "Request title" });
    await waitFor(() => expect(Math.abs(edge(stripTitle) - edge(titleField))).toBeLessThanOrEqual(1));
    await expect(Math.round(edge(titleField))).toBe(window.innerWidth <= 640 ? 16 : 24);
  },
};

export const InheritsCurrentProject: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/", query: { status: "open", project: "00000000-0000-4000-8000-000000000456" } } } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: "New Request" })).toHaveAttribute("href", "/intake?project=00000000-0000-4000-8000-000000000456");
    const { composer, page } = await openComposer(canvasElement);
    await expect(await composer.findByRole("button", { name: "Project: Website" })).toBeVisible();
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByText("Website")).toBeVisible());
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "00000000-0000-4000-8000-000000000456" }), context);
    await userEvent.click(composer.getByRole("button", { name: "Create Request" }));
    const openRequest = await page.findByRole("button", { name: "Open Request" });
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await waitFor(() => expect(getComputedStyle(openRequest.closest("li")!).opacity).toBe("1"));
    await userEvent.click(openRequest);
    await expect(getRouter().push).toHaveBeenLastCalledWith(`/requests/${requestId}?status=open&project=00000000-0000-4000-8000-000000000456`);
  },
};

export const InheritsUppercaseProjectContext: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/", query: { project: "AE000000-0000-4000-8000-000000000002" } } } },
  beforeEach: () => {
    mocked(listProjects).mockResolvedValue({ success: true, projects: [{ id: "ae000000-0000-4000-8000-000000000002", name: "Website", description: null }] });
  },
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await expect(await composer.findByRole("button", { name: "Project: Website" })).toBeVisible();
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByText("Website")).toBeVisible());
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "ae000000-0000-4000-8000-000000000002" }), context);
  },
};

export const ProjectContextPreservesRestoredDraft: Story = {
  parameters: InheritsCurrentProject.parameters,
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId), {
      source: { ...source, affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: null, requestType: null, expectedImpact: metricImpact },
      review: null,
    });
  },
  play: async ({ canvasElement }) => {
    const { composer, page } = await openComposer(canvasElement);
    await waitFor(() => expect(composer.getByRole("textbox", { name: "Request title" })).toHaveValue(source.title));
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    await expect(await (await projectSurface(page)).findByRole("option", { name: "Website" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect(composer.getByRole("button", { name: "Project" })).toBeVisible();
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("button", { name: "Create Request" })).toBeVisible());
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: null }), context);
  },
};

export const ProjectContextPreservesClearedSelection: Story = {
  parameters: InheritsCurrentProject.parameters,
  play: async ({ canvasElement }) => {
    const { composer, page } = await openComposer(canvasElement);
    await userEvent.click(await composer.findByRole("button", { name: "Project: Website" }));
    await userEvent.click(await (await projectSurface(page)).findByRole("option", { name: "No project" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Choose a Project" })).not.toBeInTheDocument(), { timeout: 5000 });
    await waitForInteractive(composer.getByRole("textbox", { name: "Request title" }));
    await userEvent.click(composer.getByRole("textbox", { name: "Request title" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    const reopened = await openComposer(canvasElement);
    await expect(reopened.composer.getByRole("button", { name: "Project" })).toBeVisible();
  },
};

export const ProjectContextIgnoresUnavailableProject: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/", query: { project: "00000000-0000-4000-8000-000000000999" } } } },
  play: async ({ canvasElement }) => {
    const { composer, page } = await openComposer(canvasElement);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    await expect(await (await projectSurface(page)).findByRole("option", { name: "Website" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("button", { name: "Create Request" })).toBeVisible());
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: null }), context);
  },
};

export const ProjectContextDoesNotChangeAnEditedDraft: Story = {
  parameters: InheritsCurrentProject.parameters,
  play: async ({ canvasElement }) => {
    let resolveProjects!: (value: Awaited<ReturnType<typeof listProjects>>) => void;
    mocked(listProjects).mockImplementationOnce(() => new Promise((resolve) => { resolveProjects = resolve; }));
    const { composer, page } = await openComposer(canvasElement);
    await fillComposer(composer);
    resolveProjects({ success: true, projects: [{ id: "00000000-0000-4000-8000-000000000456", name: "Website", description: null }] });
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    await expect(await (await projectSurface(page)).findByRole("option", { name: "Website" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("button", { name: "Create Request" })).toBeVisible());
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: null }), context);
  },
};

export const ReviewPreview: Story = {
  play: async ({ canvasElement }) => {
    const { composer, dialog, page } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    await userEvent.click(await (await projectSurface(page)).findByRole("option", { name: "Website" }));
    await expect(dialog).toHaveAttribute("data-state", "open");
    await waitForInteractive(composer.getByRole("button", { name: "Labels" }));
    await userEvent.click(composer.getByRole("button", { name: "Labels" }));
    await userEvent.click(await page.findByRole("checkbox", { name: "Improvement" }));
    await expect(dialog).toHaveAttribute("data-state", "open");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Labels" })).not.toBeInTheDocument());
    await waitForInteractive(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(composer.getByRole("button", { name: "Add link" }));
    await userEvent.type(within(canvasElement.ownerDocument.body).getByRole("textbox", { name: "Related link" }), "https://example.test/customer-interviews");
    await userEvent.upload(composer.getByLabelText("Choose Request files"), new File(["Customer interview notes"], "interview-notes.txt", { type: "text/plain" }));
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await expect(await page.findByRole("dialog", { name: "New Request" })).toBeVisible();
    await expect(composer.getAllByRole("heading", { name: "Review Request" })).toHaveLength(1);
    await waitFor(() => expect(composer.getByRole("heading", { name: source.title })).toBeVisible());
    await expect(composer.queryByRole("heading", { name: "Review your Request" })).not.toBeInTheDocument();
    await expect(composer.getByRole("button", { name: "Create Request" })).toBeEnabled();
    await expect(saveRequest).not.toHaveBeenCalled();
  },
};

export const LongReviewKeepsActionsVisible: Story = {
  play: async ({ canvasElement }) => {
    const { composer, dialog, page } = await openComposer(canvasElement);
    await fillComposer(composer);
    const description = composer.getByRole("textbox", { name: "Description" });
    await userEvent.clear(description);
    await userEvent.click(description);
    await userEvent.paste(Array.from({ length: 16 }, (_, index) => `Interview ${index + 1}: Customers return to the editor but cannot identify their unfinished draft. They open several items before finding the version with their latest changes.`).join("\n\n"));
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    const heading = await composer.findByRole("heading", { name: "Review Request" });
    const create = composer.getByRole("button", { name: "Create Request" });
    const edit = composer.getByRole("button", { name: "Edit Request" });
    await waitFor(() => expect(heading).toHaveFocus());
    await Promise.all(dialog.getAnimations({ subtree: true }).map((animation) => animation.finished));
    const before = create.getBoundingClientRect();
    await expect(before.top).toBeGreaterThanOrEqual(0);
    await expect(before.bottom).toBeLessThanOrEqual(window.innerHeight);
    let scroller: HTMLElement | null = composer.getByText(source.title).parentElement;
    while (scroller && scroller !== dialog && !(/auto|scroll/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
    await expect(scroller).not.toBeNull();
    await expect(scroller).not.toBe(dialog);
    scroller!.scrollTop = scroller!.scrollHeight;
    scroller!.dispatchEvent(new Event("scroll"));
    await waitFor(() => expect(scroller!.scrollTop).toBeGreaterThan(0));
    const after = create.getBoundingClientRect();
    await expect(Math.abs(after.top - before.top)).toBeLessThan(1);
    await expect(after.bottom).toBeLessThanOrEqual(window.innerHeight);
    await userEvent.click(edit);
    await expect(await page.findByRole("dialog", { name: "New Request" })).toBeVisible();
    await expect((composer.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement).value).toContain("Interview 16:");
    await expect(saveRequest).not.toHaveBeenCalled();
  },
};

/** Older saved drafts use the same measurement controls without changing their saved format. */
function restoreLegacyEmptyDraft() {
  writeIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId), {
    source: { title: "", description: "", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: null, requestType: "improvement", expectedImpact: { ...EMPTY_METRIC_IMPACT } },
    review: null,
  });
}

/** Server rejections focus the shared metric picker and preserve the draft. */
async function expectImpactRevealed(composer: ReturnType<typeof within>, message: string) {
  const metric = await composer.findByRole("combobox", { name: "Metric" });
  await waitFor(() => expect(metric).toHaveFocus());
  await expect(metric).toHaveTextContent(metricImpact.metric);
  await expect(composer.getByText(message)).toBeVisible();
  return composer.getByRole("region", { name: "Request measurement" });
}

export const TriageImpactErrorKeepsSharedControls: Story = {
  beforeEach: () => {
    restoreLegacyEmptyDraft();
    mocked(runTriage).mockResolvedValueOnce({ success: false, error: { code: "validation", field: "expectedImpact", message: "Check the expected impact before reviewing this Request." } });
  },
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await expectImpactRevealed(composer, "Check the expected impact before reviewing this Request.");
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: metricImpact }), context);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("heading", { name: "Review Request" })).toHaveFocus());
    await expect(runTriage).toHaveBeenCalledTimes(2);
    await expect(saveRequest).not.toHaveBeenCalled();
  },
};

export const SaveImpactErrorKeepsSharedControls: Story = {
  beforeEach: () => {
    restoreLegacyEmptyDraft();
    mocked(saveRequest).mockResolvedValueOnce({ success: false, error: { code: "validation", field: "expectedImpact", message: "Add the expected impact, then review this Request again before creating it." } });
  },
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await composer.findByRole("button", { name: "Create Request" }));
    await composer.findByRole("textbox", { name: "Request title" });
    const impact = await expectImpactRevealed(composer, "Add the expected impact, then review this Request again before creating it.");
    await expect(within(impact).getByRole("spinbutton", { name: "Target after release (optional)" })).toHaveValue(metricImpact.target);
    await expect(composer.getByRole("textbox", { name: "Request title" })).toHaveValue(source.title);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("heading", { name: "Review Request" })).toHaveFocus());
    await expect(runTriage).toHaveBeenCalledTimes(2);
    await expect(saveRequest).toHaveBeenCalledTimes(1);
  },
};

/** Every keystroke in the title or description renders the form again. The measurement editor,
 * the largest part of it (Radix selects, a menu, number fields and a date dialog), sits those
 * renders out: its value is watched on its own and keeps its identity until its content changes.
 * Before that, a render on each of fillComposer's 110 keystrokes took the stories that fill the
 * composer past their 15 s timeout under CPU load, and user-event's leftover keystrokes then
 * landed in the next story's title. The editor is the real component, spied in preview.tsx. */
export const TypingLeavesTheMeasurementEditorAlone: Story = {
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    const title = composer.getByRole("textbox", { name: "Request title" });
    await waitFor(() => expect(title).toHaveFocus());
    await expect(composer.getByRole("region", { name: "Primary metric" })).toBeVisible();
    mocked(MeasurementPlanFields).mockClear();
    await userEvent.type(title, source.title);
    await userEvent.type(composer.getByRole("textbox", { name: "Description" }), source.description);
    await expect(title).toHaveValue(source.title);
    await expect(composer.getByRole("textbox", { name: "Description" })).toHaveValue(source.description);
    await expect(MeasurementPlanFields).not.toHaveBeenCalled();
    // Its own edits still reach it.
    await fillMetricImpact(composer);
    await expect(MeasurementPlanFields).toHaveBeenCalled();
    await expect(composer.getByRole("combobox", { name: "Metric" })).toHaveTextContent("Conversion rate");
    await expect(composer.getByRole("spinbutton", { name: "Target after release (optional)" })).toHaveValue(90);
  },
};

export const TriageMeasurementErrorKeepsDraft: Story = {
  beforeEach: () => {
    mocked(runTriage).mockResolvedValueOnce({ success: false, error: { code: "validation", field: "expectedImpact", message: "Check the measurement before reviewing this Request." } });
  },
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await expect(await composer.findByText("Check the measurement before reviewing this Request.")).toBeVisible();
    await waitFor(() => expect(composer.getByRole("combobox", { name: "Metric" })).toHaveFocus());
    await expectDraftKept(composer);
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: measurementImpact }), context);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("heading", { name: "Review Request" })).toHaveFocus());
    await expect(runTriage).toHaveBeenCalledTimes(2);
    await expect(saveRequest).not.toHaveBeenCalled();
  },
};

export const SaveMeasurementErrorKeepsDraft: Story = {
  beforeEach: () => {
    mocked(saveRequest).mockResolvedValueOnce({ success: false, error: { code: "validation", field: "expectedImpact", message: "Check the measurement, then review this Request again." } });
  },
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await composer.findByRole("button", { name: "Create Request" }));
    await expect(await composer.findByText("Check the measurement, then review this Request again.")).toBeVisible();
    await waitFor(() => expect(composer.getByRole("combobox", { name: "Metric" })).toHaveFocus());
    await expectDraftKept(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("heading", { name: "Review Request" })).toHaveFocus());
    await expect(runTriage).toHaveBeenCalledTimes(2);
    await expect(saveRequest).toHaveBeenCalledTimes(1);
  },
};

export const OptionalRequestProperties: Story = {
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await expect(composer.getByRole("button", { name: "Project" })).toBeVisible();
    await expect(composer.getByRole("button", { name: "Labels" })).toBeVisible();
    await expect(composer.getByRole("textbox", { name: "Request title" })).toBeVisible();
    await expect(composer.getByRole("textbox", { name: "Description" })).toBeVisible();
    await expect(composer.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
    await expect(composer.queryByRole("button", { name: "Feedback & links" })).not.toBeInTheDocument();
    await expect(composer.queryByRole("region", { name: "Details from your earlier draft" })).not.toBeInTheDocument();
    for (const label of ["Who is affected?", "What should people be able to do?", "Examples or feedback", "What do you still need to find out?"]) {
      await expect(composer.queryByLabelText(label)).not.toBeInTheDocument();
    }
    await expect(composer.getByRole("button", { name: "Attach files" })).toBeVisible();
    await expect(within(canvasElement.ownerDocument.body).queryByRole("textbox", { name: "Related link" })).not.toBeInTheDocument();
    await userEvent.click(composer.getByRole("button", { name: "Add link" }));
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).getByRole("textbox", { name: "Related link" })).toBeVisible());
  },
};

export const AddLinkPopover: Story = {
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId), {
      source: { ...source, affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: null, requestType: "improvement", expectedImpact: {
        ...measurementImpact,
        guardrails: [{ key: "support", name: "", unit: "percent", current: 4, noBaseline: false, operator: "at_most", limit: 6 }],
      } },
      review: null,
    });
  },
  play: async ({ canvasElement }) => {
    const { composer, page, dialog } = await openComposer(canvasElement);
    const toggle = composer.getByRole("button", { name: "Add link" });
    const primary = composer.getByRole("region", { name: "Primary metric" });
    const position = primary.offsetTop;
    await userEvent.click(toggle);
    const popover = await page.findByRole("dialog", { name: "Related link" });
    let input = within(popover).getByRole("textbox", { name: "Related link" });
    await waitFor(() => expect(input).toHaveFocus());
    await expect(primary.offsetTop).toBe(position);
    await expect(dialog).toBeVisible();
    await expect(popover.getBoundingClientRect().width).toBeLessThanOrEqual(352);
    await expect(popover.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    await expect(popover.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth);
    await userEvent.type(input, "https://example.test/customer-feedback");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Related link" })).not.toBeInTheDocument());
    await expect(toggle).toHaveFocus();
    await expect(dialog).toBeVisible();
    await userEvent.keyboard("{Enter}");
    input = within(await page.findByRole("dialog", { name: "Related link" })).getByRole("textbox", { name: "Related link" });
    await waitFor(() => expect(input).toHaveFocus());
    await expect(input).toHaveValue("https://example.test/customer-feedback");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(toggle).toHaveFocus());
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Related link" })).not.toBeInTheDocument());
    await expect(runTriage).not.toHaveBeenCalled();
    await expect(saveRequest).not.toHaveBeenCalled();
    await userEvent.click(toggle);
    input = within(await page.findByRole("dialog", { name: "Related link" })).getByRole("textbox", { name: "Related link" });
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.clear(input);
    await userEvent.type(input, "http://example.test/insecure");
    await userEvent.click(within(page.getByRole("dialog", { name: "Related link" })).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(page.getByText("Enter a complete link, including https://")).toBeVisible());
    await expect(input).toHaveFocus();
    await userEvent.clear(input);
    await userEvent.type(input, "https://example.test/customer-feedback");
    await userEvent.click(within(page.getByRole("dialog", { name: "Related link" })).getByRole("button", { name: "Done" }));
    await waitFor(() => expect(toggle).toHaveFocus());
    await userEvent.click(toggle);
    await waitFor(() => expect(page.getByRole("textbox", { name: "Related link" })).toHaveFocus());
    await userEvent.keyboard("{Tab}");
    await expect(page.getByRole("button", { name: "Remove link" })).toHaveFocus();
    await userEvent.keyboard("{Tab}");
    await expect(page.getByRole("button", { name: /^Done$/ })).toHaveFocus();
    await userEvent.keyboard("{Tab}");
    await waitFor(() => expect(composer.getByRole("button", { name: "Attach files" })).toHaveFocus());
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Related link" })).not.toBeInTheDocument());
    await expect(dialog).toBeVisible();
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ usefulLink: "https://example.test/customer-feedback" }), context));
  },
};

export const DraftSurvivesClose: Story = {
  play: async ({ canvasElement }) => {
    const { page, composer, trigger } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.upload(composer.getByLabelText("Choose Request files"), new File(["Customer interview notes"], "interview-notes.txt", { type: "text/plain" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(getRouter().push).not.toHaveBeenCalled();
    const reopened = await openComposer(canvasElement);
    await expect(reopened.composer.getByRole("textbox", { name: "Request title" })).toHaveValue(source.title);
    await expect(reopened.composer.getByRole("textbox", { name: "Description" })).toHaveValue(source.description);
    await expect(reopened.composer.getByRole("combobox", { name: "Metric" })).toHaveTextContent("Conversion rate");
    await expect(reopened.composer.getByRole("spinbutton", { name: "Current value" })).toHaveValue(null);
    await expect(reopened.composer.getByRole("spinbutton", { name: "Target after release (optional)" })).toHaveValue(90);
    await expect(reopened.composer.getByRole("button", { name: "Measurement window" })).toHaveTextContent("14 days after release");
    await expect(reopened.composer.getByText("interview-notes.txt")).toBeVisible();
    await expect(prepareAttachmentUpload).not.toHaveBeenCalled();
  },
};

export const WorkspaceSwitchProtectsFiles: Story = {
  play: async ({ canvasElement }) => {
    const { page, composer } = await openComposer(canvasElement);
    await userEvent.upload(composer.getByLabelText("Choose Request files"), new File(["Notes"], "notes.txt", { type: "text/plain" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await expect(() => assertWorkspaceCanSwitch()).toThrow(/unsaved changes or files/);
    const reopened = await openComposer(canvasElement);
    await expect(reopened.composer.getByText("notes.txt")).toBeVisible();
    await userEvent.click(reopened.composer.getByRole("button", { name: "Remove notes.txt" }));
    await waitFor(() => expect(() => assertWorkspaceCanSwitch()).not.toThrow());
  },
};

export const WorkspaceSwitchProtectsDraft: Story = {
  play: async ({ canvasElement }) => {
    const { page, composer } = await openComposer(canvasElement);
    await userEvent.type(composer.getByRole("textbox", { name: "Request title" }), "Keep this draft");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    const original = Storage.prototype.setItem;
    try {
      Storage.prototype.setItem = () => { throw new DOMException("Storage unavailable", "QuotaExceededError"); };
      await expect(() => assertWorkspaceCanSwitch()).toThrow(/unsaved changes or files/);
    } finally { Storage.prototype.setItem = original; }
    await expect(() => assertWorkspaceCanSwitch()).not.toThrow();
    const reopened = await openComposer(canvasElement);
    await expect(reopened.composer.getByRole("textbox", { name: "Request title" })).toHaveValue("Keep this draft");
  },
};

export const CreateWithoutLeaving: Story = {
  play: async ({ canvasElement }) => {
    const { page, composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await expect(composer.queryByRole("textbox", { name: "Where will you check this?" })).not.toBeInTheDocument();
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("heading", { name: "Review Request" })).toBeVisible());
    await expect(runTriage).toHaveBeenCalledTimes(1);
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: measurementImpact }), context);
    await expect(saveRequest).not.toHaveBeenCalled();
    await userEvent.click(composer.getByRole("button", { name: "Create Request" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await expect(saveRequest).toHaveBeenCalledTimes(1);
    // saveRequest revalidates the list itself; the composer must not refresh
    // the router again after a successful save (plan item 1.3).
    await expect(getRouter().refresh).not.toHaveBeenCalled();
    await expect(getRouter().push).not.toHaveBeenCalled();
    await userEvent.click(within(canvasElement).getByRole("link", { name: "Profile navigation fixture" }));
    await expect(profileNavigation).toHaveBeenCalledTimes(1);
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    await expect(unload.defaultPrevented).toBe(false);
    const openRequest = await page.findByRole("button", { name: "Open Request" });
    const reopened = await openComposer(canvasElement);
    await expect(reopened.composer.getByRole("textbox", { name: "Request title" })).toHaveValue("");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(openRequest);
    await expect(getRouter().push).toHaveBeenCalledWith(`/requests/${requestId}`);
  },
};

export const CheckingCannotDismiss: Story = {
  beforeEach: () => { mocked(runTriage).mockImplementation(() => new Promise(() => {})); },
  play: async ({ canvasElement }) => {
    const { composer, dialog } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    // Plan item 2.3: the review step's shape with a visible status, at once.
    const status = await composer.findByText("Checking whether this describes a problem…");
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute("role", "status");
    await waitFor(() => expect(composer.getByRole("heading", { name: "Review Request", level: 2 })).toHaveFocus());
    await expect(composer.queryByRole("textbox", { name: "Request title" })).not.toBeInTheDocument();
    await expect(composer.getByRole("button", { name: "Review Request" })).toHaveAttribute("aria-busy", "true");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(getRouter().push).not.toHaveBeenCalled();
    await expect(saveRequest).not.toHaveBeenCalled();
  },
};

export const CreatingCannotDismiss: Story = {
  beforeEach: () => { mocked(saveRequest).mockImplementation(() => new Promise(() => {})); },
  play: async ({ canvasElement }) => {
    const { composer, dialog } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await composer.findByRole("button", { name: "Create Request" }));
    await expect(await composer.findByRole("button", { name: "Creating Request…" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.keyboard("{Escape}");
    await expect(dialog).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

export const FailedUploadStaysRecoverable: Story = {
  play: async ({ canvasElement }) => {
    const { page, composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.upload(composer.getByLabelText("Choose Request files"), new File(["Customer interview notes"], "interview-notes.txt", { type: "text/plain" }));
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await composer.findByRole("button", { name: "Create Request" }));
    await waitFor(() => expect(composer.getByRole("heading", { name: "Some files weren’t uploaded" })).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    const reopened = await openComposer(canvasElement, false);
    await waitFor(() => expect(reopened.composer.getByText("interview-notes.txt")).toBeVisible());
    await userEvent.click(reopened.composer.getByRole("button", { name: "Retry upload" }));
    await expect(await reopened.composer.findByRole("button", { name: "Retry upload" })).toBeEnabled();
    await expect(saveRequest).toHaveBeenCalledTimes(1);
    await userEvent.click(reopened.composer.getByRole("button", { name: "Skip failed files" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await expect(getRouter().refresh).not.toHaveBeenCalled();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

export const FiveFailedAttachmentsRemainReachable: Story = {
  parameters: { viewport: { defaultViewport: "mobile" } },
  play: async ({ canvasElement }) => {
    const { page, composer, dialog, trigger } = await openComposer(canvasElement);
    await fillComposer(composer);
    const files = Array.from({ length: 5 }, (_, index) => new File([`Customer interview ${index + 1}`], `customer-interview-${index + 1}.txt`, { type: "text/plain" }));
    await userEvent.upload(composer.getByLabelText("Choose Request files"), files);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await composer.findByRole("button", { name: "Create Request" }));
    const heading = await composer.findByRole("heading", { name: "Some files weren’t uploaded" });
    await waitFor(() => expect(heading).toHaveFocus());
    const uploads = composer.getByRole("list", { name: "Request file uploads" });
    await expect(within(uploads).getAllByRole("listitem")).toHaveLength(5);
    await expect(prepareAttachmentUpload).toHaveBeenCalledTimes(5);
    const skip = composer.getByRole("button", { name: "Skip failed files" });
    await expect(skip).toBeEnabled();
    let scroller: HTMLElement | null = uploads.parentElement;
    await waitFor(() => {
      scroller = uploads.parentElement;
      while (scroller && scroller !== dialog && !(/auto|scroll/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
      expect(scroller).not.toBeNull();
      expect(scroller).not.toBe(dialog);
    });
    scroller!.scrollTop = 0;
    for (let step = 0; step < 16 && document.activeElement !== skip; step += 1) await userEvent.tab();
    await waitFor(() => {
      expect(skip).toHaveFocus();
      const bounds = skip.getBoundingClientRect();
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
    });
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await expect(saveRequest).toHaveBeenCalledTimes(1);
    const openRequest = await page.findByRole("button", { name: "Open Request" });
    await waitFor(() => expect(getComputedStyle(openRequest.closest("li")!).opacity).toBe("1"));
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

export const ActiveRetryCannotDismiss: Story = {
  play: async ({ canvasElement }) => {
    const { composer, dialog } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.upload(composer.getByLabelText("Choose Request files"), new File(["Customer interview notes"], "interview-notes.txt", { type: "text/plain" }));
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await composer.findByRole("button", { name: "Create Request" }));
    await waitFor(() => expect(composer.getByRole("heading", { name: "Some files weren’t uploaded" })).toBeVisible());
    mocked(prepareAttachmentUpload).mockImplementation(() => new Promise(() => {}));
    await userEvent.click(composer.getByRole("button", { name: "Retry upload" }));
    await userEvent.keyboard("{Escape}");
    await expect(dialog).toBeVisible();
    await expect(saveRequest).toHaveBeenCalledTimes(1);
  },
};

export const KeyboardShortcutRespectsContext: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const search = canvas.getByRole("textbox", { name: "Filter existing Requests" });
    await userEvent.click(search);
    await userEvent.keyboard("c");
    await expect(search).toHaveValue("c");
    await expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Open another dialog" }));
    const otherDialog = await page.findByRole("dialog", { name: "Another dialog" });
    await userEvent.keyboard("c");
    await expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument();
    await userEvent.click(within(otherDialog).getByRole("button", { name: "Return to Requests" }));
    await waitFor(() => expect(otherDialog).not.toBeVisible());
    await userEvent.keyboard("c");
    const dialog = await page.findByRole("dialog", { name: "New Request" });
    await waitFor(() => expect(dialog).toBeVisible());
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

const workspaceRequests: OverviewRequest[] = [
  { id: "example-1", title: "Customers cannot find the delivery date before checkout", status: "open", reframedProblem: null, creatorName: "Alex Morgan", assigneeName: null, createdAt: "2026-10-05T09:00:00.000Z" },
  { id: "example-2", title: "New teammates do not know which workspace to join", status: "in_progress", reframedProblem: null, creatorName: "Jordan Patel", assigneeName: "Sam Lee", createdAt: "2026-10-04T09:00:00.000Z" },
];

export const InWorkspace: Story = {
  render: () => (
    <NewRequestProvider context={context} draftOwnerId={draftOwnerId}>
      <WorkspaceSidebarFixture pathname="/" requests={workspaceRequests} orgId={context.orgId}>
        <RequestsOverview filter="all" isGuest={false} requests={workspaceRequests} />
      </WorkspaceSidebarFixture>
    </NewRequestProvider>
  ),
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await expect(composer.getByRole("textbox", { name: "Request title" })).toBeVisible();
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
};

export const MobileComposerReturnsToNavigation: Story = {
  render: InWorkspace.render,
  parameters: { viewport: { defaultViewport: "mobile" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const opener = await canvas.findByRole("button", { name: "Expand sidebar" });
    await userEvent.click(opener);
    const navigation = within(await page.findByRole("complementary", { name: "Workspace sidebar" }));
    await userEvent.click(navigation.getByRole("link", { name: "New Request" }));
    const dialog = await page.findByRole("dialog", { name: "New Request" });
    const title = await within(dialog).findByRole("textbox", { name: "Request title" });
    await waitFor(() => expect(title).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    const reopenedNavigation = await page.findByRole("complementary", { name: "Workspace sidebar" });
    await waitFor(() => expect(reopenedNavigation).toHaveAttribute("data-peeking", "true"));
    await waitFor(() => expect(within(reopenedNavigation).getByRole("link", { name: "New Request" })).toBeVisible());
  },
};

export const StandaloneLinkFallback: Story = {
  render: () => <main className="p-6"><NewRequestLink>New Request</NewRequestLink></main>,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: "New Request" })).toHaveAttribute("href", "/intake");
  },
};

export const DirectIntakeEntry: Story = {
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/intake", query: {} } } },
  render: () => <NewRequestProvider context={context} draftOwnerId={draftOwnerId}><main className="p-6"><NewRequestLink>Create Request</NewRequestLink></main></NewRequestProvider>,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const link = within(canvasElement).getByRole("link", { name: "Create Request" });
    await expect(page.queryByRole("textbox", { name: "Request title" })).not.toBeInTheDocument();
    await expect(link).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.click(link);
    const dialog = await page.findByRole("dialog", { name: "New Request" });
    await waitFor(() => expect(within(dialog).getByRole("textbox", { name: "Request title" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await waitFor(() => expect(link).toHaveFocus());
    await userEvent.keyboard("c");
    await waitFor(() => expect(page.getByRole("textbox", { name: "Request title" })).toHaveFocus());
  },
};

export const CompactImpactValidation: Story = {
  beforeEach: restoreLegacyEmptyDraft,
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await expect(composer.getByRole("combobox", { name: "Metric" })).toBeVisible();
    await userEvent.type(composer.getByRole("textbox", { name: "Request title" }), source.title);
    await userEvent.type(composer.getByRole("textbox", { name: "Description" }), source.description);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("combobox", { name: "Metric" })).toHaveFocus());
    await expect(runTriage).not.toHaveBeenCalled();
  },
};

export const PropertiesSaveAndRestore: Story = {
  play: async ({ canvasElement }) => {
    const { page, dialog, composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    await userEvent.click(await (await projectSurface(page)).findByRole("option", { name: "Website" }));
    await expect(dialog).toHaveAttribute("data-state", "open");
    await waitForInteractive(composer.getByRole("button", { name: "Labels" }));
    await userEvent.click(composer.getByRole("button", { name: "Labels" }));
    await userEvent.click(await page.findByRole("checkbox", { name: "Bug" }));
    await expect(dialog).toHaveAttribute("data-state", "open");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Labels" })).not.toBeInTheDocument());
    await waitForInteractive(composer.getByRole("textbox", { name: "Request title" }));
    await expect(composer.getByRole("button", { name: "Project: Website" })).toBeVisible();
    await userEvent.click(composer.getByRole("textbox", { name: "Request title" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    const reopened = await openComposer(canvasElement);
    await expect(reopened.composer.getByRole("button", { name: "Project: Website" })).toBeVisible();
    await expect(reopened.composer.getByRole("button", { name: "Labels: Bug" })).toBeVisible();
    await userEvent.click(reopened.composer.getByRole("button", { name: "Review Request" }));
    await waitFor(async () => expect(await reopened.composer.findByText("Website")).toBeVisible());
    await expect(reopened.composer.getByText("Bug")).toBeVisible();
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "00000000-0000-4000-8000-000000000456", requestType: "bug" }), context);
    await userEvent.click(reopened.composer.getByRole("button", { name: "Create Request" }));
    await waitFor(() => expect(saveRequest).toHaveBeenCalledWith({ token: "story-composer-review-token", editedProblemText: null }, context));
    const openRequest = await page.findByRole("button", { name: "Open Request" });
    await waitFor(() => {
      expect(getComputedStyle(openRequest.parentElement!).opacity).toBe("1");
      expect(getComputedStyle(openRequest.closest("li")!).opacity).toBe("1");
    });
  },
};

export const CreateProjectInline: Story = {
  play: async ({ canvasElement }) => {
    const { page, composer } = await openComposer(canvasElement);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    const project = await projectSurface(page);
    await userEvent.click(project.getByRole("button", { name: "New Project" }));
    await userEvent.type(project.getByRole("textbox", { name: "Project name" }), "Marketing");
    await userEvent.click(project.getByRole("button", { name: "Create Project" }));
    await waitFor(async () => expect(await composer.findByRole("button", { name: "Project: Marketing" })).toBeVisible());
    await expect(createProject).toHaveBeenCalledWith({ name: "Marketing" }, context);
    await expect(getRouter().push).not.toHaveBeenCalled();
    await waitFor(() => expect(composer.getByRole("button", { name: "Project: Marketing" }).querySelector('[data-motion-pop-id][aria-hidden="true"]')).toBeNull());
  },
};

export const NewProjectFromPicker: Story = {
  play: async ({ canvasElement }) => {
    let resolveCreate!: (result: Awaited<ReturnType<typeof createProject>>) => void;
    mocked(createProject).mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const { page, composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    const project = await projectSurface(page);
    // A native click exercises Radix's deferred outside-pointer handler. vitest/browser loads only in the
    // Vitest run: imported at the top, it stopped every story in this file rendering in plain Storybook.
    const { page: browserPage } = await import("vitest/browser");
    await browserPage.getByRole("dialog", { name: "Choose a Project" }).getByRole("button", { name: "New Project", exact: true }).click();
    const name = project.getByRole("textbox", { name: "Project name" });
    await waitFor(() => expect(name).toHaveFocus());
    await expect(project.getByRole("button", { name: "Create Project" })).toBeDisabled();
    await userEvent.keyboard("{Enter}");
    await expect(createProject).not.toHaveBeenCalled();
    await expect(runTriage).not.toHaveBeenCalled();
    await userEvent.type(name, "  Marketing  ");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await waitFor(() => expect(project.getByRole("status")).toHaveTextContent("Creating Project…"));
    await expect(name).toBeDisabled();
    await expect(project.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(composer.getByRole("button", { name: "Review Request" })).toBeDisabled();
    await userEvent.keyboard("{Escape}");
    await expect(page.getByRole("dialog", { name: "Choose a Project" })).toBeVisible();
    await expect(runTriage).not.toHaveBeenCalled();
    resolveCreate({ success: true, project: { id: "00000000-0000-4000-8000-000000000789", name: "Marketing", description: null } });
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Choose a Project" })).not.toBeInTheDocument());
    await waitFor(() => expect(composer.getByRole("button", { name: "Project: Marketing" })).toHaveFocus());
    await expect(createProject).toHaveBeenCalledTimes(1);
    await expect(createProject).toHaveBeenCalledWith({ name: "Marketing" }, context);
    await expect(composer.getByRole("textbox", { name: "Request title" })).toHaveValue(source.title);
    await expect(composer.getByRole("button", { name: "Review Request" })).toBeEnabled();
    await expect(runTriage).not.toHaveBeenCalled();
  },
};

export const NewProjectCancelPreservesDraft: Story = {
  parameters: InheritsCurrentProject.parameters,
  play: async ({ canvasElement }) => {
    const { page, composer } = await openComposer(canvasElement);
    await userEvent.type(composer.getByRole("textbox", { name: "Request title" }), source.title);
    await userEvent.click(composer.getByRole("button", { name: "Project: Website" }));
    const project = await projectSurface(page);
    await userEvent.click(project.getByRole("button", { name: "New Project" }));
    const projectForm = page.getByRole("dialog", { name: "Choose a Project" });
    const formPadding = getComputedStyle(projectForm).padding;
    const formWidth = getComputedStyle(projectForm).width;
    await userEvent.type(project.getByRole("textbox", { name: "Project name" }), "Abandoned name");
    await userEvent.click(project.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(project.getByRole("option", { name: "Website" })).toHaveFocus());
    await expect(project.getByRole("option", { name: "Website" })).toHaveAttribute("aria-selected", "true");
    await expect(project.getByRole("button", { name: "New Project" })).toBeVisible();
    await expect(createProject).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Choose a Project" })).not.toBeInTheDocument());
    await expect(composer.getByRole("button", { name: "Project: Website" })).toBeVisible();
    await expect(composer.getByRole("textbox", { name: "Request title" })).toHaveValue(source.title);
    await userEvent.click(composer.getByRole("button", { name: "Add link" }));
    const linkForm = page.getByRole("dialog", { name: "Related link" });
    await expect(getComputedStyle(linkForm).padding).toBe(formPadding);
    await expect(getComputedStyle(linkForm).width).toBe(formWidth);
    await userEvent.keyboard("{Escape}");
  },
};

export const NewProjectFailureKeepsName: Story = {
  beforeEach: () => {
    mocked(createProject).mockResolvedValueOnce({ success: false, error: { code: "save_failed", message: "The Project could not be created. Try again." } });
  },
  play: async ({ canvasElement }) => {
    const { page, composer } = await openComposer(canvasElement);
    await userEvent.type(composer.getByRole("textbox", { name: "Request title" }), source.title);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    const project = await projectSurface(page);
    await userEvent.click(project.getByRole("button", { name: "New Project" }));
    const name = project.getByRole("textbox", { name: "Project name" });
    await userEvent.type(name, "Marketing");
    await userEvent.click(project.getByRole("button", { name: "Create Project" }));
    await waitFor(() => expect(project.getByRole("alert")).toHaveTextContent("The Project could not be created. Try again."));
    await waitFor(() => expect(name).toHaveFocus());
    await expect(name).toHaveValue("Marketing");
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Choose a Project" })).not.toBeInTheDocument());
    await expect(composer.getByRole("button", { name: "Project: Marketing" })).toBeVisible();
    await expect(composer.getByRole("textbox", { name: "Request title" })).toHaveValue(source.title);
    await expect(runTriage).not.toHaveBeenCalled();
  },
};

export const CreateProjectUpdatesWorkspace: Story = {
  render: () => <WorkspaceProjectsProvider orgId={context.orgId}><ComposerFixture /><SharedProjectOptions /></WorkspaceProjectsProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByLabelText("Shared Project options")).toHaveTextContent("Website"));
    const { page, composer } = await openComposer(canvasElement);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    const project = await projectSurface(page);
    await userEvent.click(project.getByRole("button", { name: "New Project" }));
    await userEvent.type(project.getByRole("textbox", { name: "Project name" }), "Marketing");
    await userEvent.click(project.getByRole("button", { name: "Create Project" }));
    await expect(await composer.findByRole("button", { name: "Project: Marketing" })).toBeVisible();
    await expect(canvas.getByLabelText("Shared Project options")).toHaveTextContent("Marketing, Website");
    await waitFor(() => expect(composer.getByRole("button", { name: "Project: Marketing" }).querySelector('[data-motion-pop-id][aria-hidden="true"]')).toBeNull());
  },
};

export const ExistingProjectAndClear: Story = {
  play: async ({ canvasElement }) => {
    const { page, dialog, composer } = await openComposer(canvasElement);
    await waitFor(() => expect(composer.getByRole("textbox", { name: "Request title" })).toHaveFocus());
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    const project = await projectSurface(page);
    await expect(project.queryByRole("searchbox")).not.toBeInTheDocument();
    await waitFor(() => expect(project.getByRole("option", { name: "No project" })).toHaveFocus());
    const selectedProject = project.getByRole("option", { name: "No project" });
    await expect(selectedProject.querySelector(".lucide-check")!.getBoundingClientRect().right).toBeGreaterThan(selectedProject.getBoundingClientRect().right - 24);
    await expect(project.getByRole("option", { name: "Website" }).querySelector(".lucide-check")).toBeNull();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Choose a Project" })).not.toBeInTheDocument());
    await waitFor(async () => expect(await composer.findByRole("button", { name: "Project: Website" })).toBeVisible());
    await waitFor(() => expect(composer.getByRole("button", { name: "Project: Website" })).toHaveAttribute("aria-expanded", "false"));
    await waitForInteractive(composer.getByRole("button", { name: "Project: Website" }));
    await userEvent.click(composer.getByRole("button", { name: "Project: Website" }));
    await waitFor(() => expect(composer.getByRole("button", { name: "Project: Website" })).toHaveAttribute("aria-expanded", "true"));
    const reopenedProject = await projectSurface(page);
    await waitFor(() => expect(reopenedProject.getByRole("option", { name: "Website" })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    await expect(reopenedProject.getByRole("button", { name: "New Project" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    await expect(reopenedProject.getByRole("option", { name: "No project" })).toHaveFocus();
    await userEvent.click(await reopenedProject.findByRole("option", { name: "No project" }));
    await waitForInteractive(composer.getByRole("button", { name: "Labels" }));
    await expect(composer.getByRole("button", { name: "Project" })).toBeVisible();
    await expect(createProject).not.toHaveBeenCalled();
    await userEvent.click(composer.getByRole("button", { name: "Labels" }));
    await userEvent.click(await page.findByRole("checkbox", { name: "Improvement" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Labels" })).not.toBeInTheDocument());
    await waitForInteractive(composer.getByRole("button", { name: "Labels: Improvement" }));
    await userEvent.click(composer.getByRole("button", { name: "Labels: Improvement" }));
    await userEvent.click(await page.findByRole("checkbox", { name: "Improvement" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Labels" })).not.toBeInTheDocument());
    await expect(composer.getByRole("button", { name: "Labels" })).toBeVisible();
    await waitFor(() => expect(dialog.querySelector('[data-motion-pop-id][aria-hidden="true"]')).toBeNull());
  },
};

export const LongProjectKeepsCheckVisible: Story = {
  play: async ({ canvasElement }) => {
    mocked(listProjects).mockResolvedValue({ success: true, projects: [{ id: "00000000-0000-4000-8000-000000000456", name: "A long Project name that should truncate without pushing the checkmark out", description: null }] });
    const { page, composer } = await openComposer(canvasElement);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    const project = await projectSurface(page);
    const selected = await project.findByRole("option", { name: "No project" });
    const longRow = project.getByRole("option", { name: /A long Project name/ });
    const dot = longRow.querySelector("[data-tone]")!;
    await expect(dot.getBoundingClientRect().width).toBeCloseTo(dot.getBoundingClientRect().height, 2);
    await waitFor(() => {
      const menu = page.getByRole("dialog", { name: "Choose a Project" }).getBoundingClientRect();
      const check = selected.querySelector(".lucide-check")!.getBoundingClientRect();
      expect(check.right).toBeLessThan(menu.right);
      expect(check.left).toBeGreaterThan(menu.left + menu.width / 2);
    });
  },
};

export const ProjectFailuresKeepDraft: Story = {
  beforeEach: () => {
    mocked(listProjects).mockResolvedValueOnce({ success: false, error: { code: "load_failed", message: "Projects could not be loaded. Try again." } });
    mocked(createProject).mockResolvedValueOnce({ success: false, error: { code: "save_failed", message: "The Project could not be created. Try again." } });
  },
  play: async ({ canvasElement }) => {
    const { page, composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    const project = await projectSurface(page);
    await waitFor(async () => expect(await page.findByText("Projects could not be loaded. Try again.")).toBeVisible());
    await userEvent.click(project.getByRole("button", { name: "Retry Projects" }));
    await userEvent.click(project.getByRole("button", { name: "New Project" }));
    await userEvent.type(project.getByRole("textbox", { name: "Project name" }), "Marketing");
    await userEvent.click(project.getByRole("button", { name: "Create Project" }));
    await waitFor(async () => expect(await page.findByText("The Project could not be created. Try again.")).toBeVisible());
    await waitFor(() => expect(project.getByRole("textbox", { name: "Project name" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await expect(page.getByRole("dialog", { name: "New Request" })).toBeVisible();
    await expect(composer.getByRole("textbox", { name: "Request title" })).toHaveValue(source.title);
    await waitForInteractive(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(async () => expect(await composer.findByRole("heading", { name: "Review Request" })).toBeVisible());
  },
};

export const CreatingProjectCannotRaceReview: Story = {
  play: async ({ canvasElement }) => {
    let resolveCreate!: (result: Awaited<ReturnType<typeof createProject>>) => void;
    mocked(createProject).mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    const { page, composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    const project = await projectSurface(page);
    await userEvent.click(project.getByRole("button", { name: "New Project" }));
    await userEvent.type(project.getByRole("textbox", { name: "Project name" }), "Marketing");
    await userEvent.click(project.getByRole("button", { name: "Create Project" }));
    await waitFor(async () => expect(await page.findByText("Creating Project…")).toBeVisible());
    await expect(composer.getByRole("button", { name: "Review Request" })).toBeDisabled();
    await userEvent.keyboard("{Control>}{Enter}{/Control}{Escape}");
    await expect(page.getByRole("dialog", { name: "New Request" })).toBeVisible();
    await expect(runTriage).not.toHaveBeenCalled();
    resolveCreate({ success: true, project: { id: "00000000-0000-4000-8000-000000000789", name: "Marketing", description: null } });
    await waitFor(async () => expect(await composer.findByRole("button", { name: "Project: Marketing" })).toBeVisible());
    await expect(composer.getByRole("button", { name: "Review Request" })).toBeEnabled();
  },
};

export const InvalidProjectCanBeCleared: Story = {
  beforeEach: () => {
    mocked(runTriage).mockResolvedValueOnce({ success: false, error: { code: "validation", field: "projectId", message: "Choose a Project in this workspace, or clear the selection." } });
  },
  play: async ({ canvasElement }) => {
    const { page, composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    await userEvent.click(await (await projectSurface(page)).findByRole("option", { name: "Website" }));
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(async () => expect(await composer.findByText("Choose a Project in this workspace, or clear the selection.")).toBeVisible());
    const picker = composer.getByRole("button", { name: "Project: Website" });
    await waitFor(() => expect(picker).toHaveFocus());
    await userEvent.click(picker);
    await userEvent.click(await (await projectSurface(page)).findByRole("option", { name: "No project" }));
    await waitForInteractive(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(async () => expect(await composer.findByRole("heading", { name: "Review Request" })).toBeVisible());
  },
};

// Plan item 2.3 states. Each runs the production composer and provider with
// Storybook's mocked actions; nothing is saved, uploaded or sent to an AI model.
const scope = intakeDraftScope(draftOwnerId, context.orgId);
const bareSource = { ...source, affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: null, requestType: null };
const reviewUnavailable = { code: "provider", message: "Review unavailable right now. Your draft is kept." } as const;

async function reachReview(canvasElement: HTMLElement) {
  const opened = await openComposer(canvasElement);
  await fillComposer(opened.composer);
  await userEvent.click(opened.composer.getByRole("button", { name: "Review Request" }));
  return opened;
}

async function expectDraftKept(composer: ReturnType<typeof within>) {
  await expect(composer.getByRole("textbox", { name: "Request title" })).toHaveValue(source.title);
  await expect(composer.getByRole("textbox", { name: "Description" })).toHaveValue(source.description);
  await expect(composer.getByRole("combobox", { name: "Metric" })).toHaveTextContent("Conversion rate");
  await expect(composer.getByRole("spinbutton", { name: "Current value" })).toHaveValue(null);
  await expect(composer.getByRole("spinbutton", { name: "Target after release (optional)" })).toHaveValue(measurementImpact.primary.target);
  await expect(composer.getByRole("button", { name: "Measurement window" })).toHaveTextContent("14 days after release");
}

export const DraftRestored: Story = {
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, scope, { source: { ...bareSource, expectedImpact: metricImpact }, review: null });
  },
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    const title = composer.getByRole("textbox", { name: "Request title" });
    await waitFor(() => expect(title).toHaveValue(source.title));
    await expect(composer.getByRole("textbox", { name: "Description" })).toHaveValue(source.description);
    await expect(composer.getByText("Draft restored")).toBeVisible();
    // One announcement: the composer's always-mounted live region says the
    // restore once, and the visible notice, inserted with its text while focus
    // moves, is not a live region (NVDA and JAWS often skip those).
    const restoredLine = "Your unsaved Request was restored.";
    const live = composer.getByText(restoredLine);
    await expect(live).toHaveAttribute("role", "status");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live).toHaveClass("sr-only");
    await expect(live.textContent).toBe(restoredLine);
    await expect(canvasElement.ownerDocument.body.textContent?.split(restoredLine)).toHaveLength(2);
    const notice = composer.getByText("Draft restored").closest('[role="note"]');
    await expect(notice).not.toBeNull();
    await expect(notice!.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    await expect(notice!.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    await expect(composer.getByRole("combobox", { name: "Metric" })).toHaveTextContent(metricImpact.metric);
    await expect(composer.getByRole("spinbutton", { name: "Target after release (optional)" })).toHaveValue(90);
    await expect(composer.getByRole("button", { name: "Measurement window" })).toHaveTextContent("14 days after release");
    await expect(composer.getByRole("combobox", { name: "Audience" })).toHaveTextContent("Audience");
    await waitFor(() => expect(title).toHaveFocus());
  },
};

export const ImpactValidationFocusesSharedControls: Story = {
  beforeEach: restoreLegacyEmptyDraft,
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await userEvent.type(composer.getByRole("textbox", { name: "Request title" }), source.title);
    await userEvent.type(composer.getByRole("textbox", { name: "Description" }), source.description);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    // A failed submit keeps the shared controls visible and focuses the picker.
    const metric = await composer.findByRole("combobox", { name: "Metric" });
    await waitFor(() => expect(metric).toHaveFocus());
    await expect(composer.getByText("Complete the metric or verified result and measurement window before reviewing.")).toBeVisible();
    await expect(runTriage).not.toHaveBeenCalled();
  },
};

export const GateSlow5s: Story = {
  beforeEach: () => { mocked(runTriage).mockImplementation(() => new Promise(() => {})); },
  play: async ({ canvasElement }) => {
    const { composer, dialog } = await reachReview(canvasElement);
    const status = await composer.findByText("Checking whether this describes a problem…");
    // Focus lands on the heading, which reads the status with it.
    const heading = composer.getByRole("heading", { name: "Review Request" });
    await waitFor(() => expect(heading).toHaveFocus());
    await expect(heading).toHaveAccessibleDescription("Checking whether this describes a problem…");
    await waitFor(() => expect(status).toHaveTextContent("Still checking. Your draft is kept."), { timeout: 7000 });
    await expect(status).toHaveAttribute("role", "status");
    await userEvent.keyboard("{Escape}");
    await expect(dialog).toBeVisible();
    await expect(canvasElement.ownerDocument.querySelector<HTMLInputElement>("#intake-title")?.value).toBe(source.title);
  },
};

/** Critique 2026-10-20: at the 844px phone height the gate notice must be scrolled into view above the footer. */
async function expectClearOfFooter(element: HTMLElement) {
  const footer = element.closest('[role="dialog"]')!.querySelector("footer")!;
  const region = footer.previousElementSibling!;
  await waitFor(() => expect(element.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.getBoundingClientRect().top));
  await expect(element.getBoundingClientRect().top).toBeGreaterThanOrEqual(region.getBoundingClientRect().top);
}

export const GateTimeout: Story = {
  beforeEach: () => {
    mocked(runTriage).mockResolvedValue({ success: false, error: { code: "timeout", message: "Review unavailable right now. Your draft is kept." } });
  },
  play: async ({ canvasElement }) => {
    const { composer } = await reachReview(canvasElement);
    await expect(await composer.findByText("Review unavailable right now")).toBeVisible();
    await expect(composer.getByText("Your draft is kept.")).toBeVisible();
    const review = composer.getByRole("button", { name: "Review Request" });
    await waitFor(() => expect(review).toHaveFocus());
    await expect(review).toBeEnabled();
    await expectDraftKept(composer);
    await expect(saveRequest).not.toHaveBeenCalled();
  },
};

export const ReviewUnavailable: Story = {
  // The spend cap and a provider error read the same; trying again works once the review is back.
  beforeEach: () => { mocked(runTriage).mockResolvedValueOnce({ success: false, error: reviewUnavailable }); },
  play: async ({ canvasElement }) => {
    const { composer } = await reachReview(canvasElement);
    await expect(await composer.findByText("Review unavailable right now")).toBeVisible();
    await expect(composer.getByText("Your draft is kept.")).toBeVisible();
    await expect(composer.queryByText(/busy|limit/i)).not.toBeInTheDocument();
    await expectDraftKept(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("button", { name: "Create Request" })).toBeVisible());
    await expect(composer.queryByText("Review unavailable right now")).not.toBeInTheDocument();
    await expect(runTriage).toHaveBeenCalledTimes(2);
  },
};

export const SessionExpiredKeepsDraft: Story = {
  beforeEach: () => {
    mocked(runTriage).mockResolvedValue({ success: false, error: { code: "session_expired", message: "Your session ended. Sign in again to continue this Request." } });
  },
  play: async ({ canvasElement }) => {
    const { composer } = await reachReview(canvasElement);
    await expect(await composer.findByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/login#/?redirect_url=%2Fintake");
    await expectClearOfFooter(composer.getByRole("link", { name: "Sign in again" }));
    await expect(composer.getByText("Your session ended")).toBeVisible();
    await expect(composer.getByText(/Your draft is kept\./)).toBeVisible();
    // One silent retry with a fresh token came first.
    await expect(runTriage).toHaveBeenCalledTimes(2);
    await expectDraftKept(composer);
    await expect(readIntakeDraft(window.sessionStorage, scope)?.source.title).toBe(source.title);
  },
};

// The 844px phone height is where the notice sits below the fold, so it must be scrolled into view; the
// 1000px test height fits it anyway. An instant mock would batch the checking step away and skip the scroll,
// which is how a capture of SessionExpiredKeepsDraft showed the notice hidden (critique 2026-10-20).
export const SessionExpiredOnPhone: Story = {
  ...SessionExpiredKeepsDraft,
  globals: { theme: "dark", viewport: { value: "mobile", isRotated: false } },
  play: async (context) => {
    // At the 1000px test height the notice fits anyway, so the story first proves the phone viewport applied.
    await expect([window.innerWidth, window.innerHeight]).toEqual([390, 844]);
    await SessionExpiredKeepsDraft.play!(context);
  },
  beforeEach: () => {
    mocked(runTriage).mockImplementation(() => new Promise(resolve => { window.setTimeout(() => resolve({ success: false, error: { code: "session_expired", message: "Your session ended. Sign in again to continue this Request." } }), 50); }));
  },
};

export const SessionRefreshRetriesSilently: Story = {
  beforeEach: () => {
    mocked(runTriage).mockResolvedValueOnce({ success: false, error: { code: "session_expired", message: "Your session ended. Sign in again to continue this Request." } });
  },
  play: async ({ canvasElement }) => {
    const { composer } = await reachReview(canvasElement);
    await waitFor(() => expect(composer.getByRole("button", { name: "Create Request" })).toBeVisible());
    await expect(composer.queryByRole("link", { name: "Sign in again" })).not.toBeInTheDocument();
    await expect(runTriage).toHaveBeenCalledTimes(2);
  },
};

// The (app) layout's order: list view state, the pending overlay, the composer, then the list.
const listRows: OverviewRequest[] = [
  { id: "composer-list-1", requestNumber: 1, title: "Customers cannot find the delivery date before checkout", reframedProblem: null, status: "open", createdAt: "2026-10-05T09:00:00.000Z", creatorName: "Alex Morgan", assigneeName: null, assignedTo: null, projectId: null, projectName: null, requestType: null, priority: "none" },
  { id: "composer-list-2", requestNumber: 2, title: "Refund emails show the wrong total", reframedProblem: null, status: "done", createdAt: "2026-10-01T09:00:00.000Z", creatorName: "Jordan Patel", assigneeName: "Sam Lee", assignedTo: "fixture-person-2", projectId: null, projectName: null, requestType: null, priority: "none" },
];
const createdRow: OverviewRequest = { id: requestId, requestNumber: 3, title: source.title, reframedProblem: null, status: "open", createdAt: "2026-10-11T09:00:00.000Z", creatorName: null, assigneeName: null, assignedTo: null, projectId: null, projectName: null, requestType: null, priority: "none" };

function ListFixture() {
  return <RequestListViewProvider><PendingMutationsProvider>
    <NewRequestProvider context={context} draftOwnerId={draftOwnerId}>
      <WorkspaceSidebarFixture pathname="/" projects={[]} requests={listRows} orgId={context.orgId}>
        <RequestsOverview requests={listRows} isGuest={false} context={context} />
      </WorkspaceSidebarFixture>
    </NewRequestProvider>
  </PendingMutationsProvider></RequestListViewProvider>;
}

/** Chooses the Done view in the layout state, as the list's status control does at any width. */
function DoneViewFixture() {
  const setView = useSetRequestListView();
  return <button type="button" onClick={() => setView((view) => withListContext(view, { status: "done" }))}>Show the Done view fixture</button>;
}

/** The list, or another page in its place, under the same layout state. */
function LeavableListFixture() {
  const [away, setAway] = useState(false);
  return <RequestListViewProvider><PendingMutationsProvider>
    <NewRequestProvider context={context} draftOwnerId={draftOwnerId}>
      <DoneViewFixture />
      <button type="button" onClick={() => setAway((value) => !value)}>{away ? "Back to the list fixture" : "Leave the list fixture"}</button>
      {away ? <p>Another page</p> : <RequestsOverview requests={listRows} isGuest={false} context={context} />}
    </NewRequestProvider>
  </PendingMutationsProvider></RequestListViewProvider>;
}

async function createFromList(canvasElement: HTMLElement) {
  const opened = await reachReview(canvasElement);
  await userEvent.click(await opened.composer.findByRole("button", { name: "Create Request" }));
  await waitFor(() => expect(opened.page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
  return opened;
}

export const CreatedVisibleInOpenGroup: Story = {
  render: () => <ListFixture />,
  beforeEach: () => { mocked(saveRequest).mockResolvedValue({ success: true, requestId, created: createdRow }); },
  play: async ({ canvasElement }) => {
    const { page } = await createFromList(canvasElement);
    // The saved row joins the Open group through the pending overlay, with no refresh.
    const open = within(canvasElement).getByRole("rowgroup", { name: "Open Requests" });
    await expect(within(open).getByRole("link", { name: source.title })).toBeVisible();
    await expect(await page.findByText("Request created")).toBeVisible();
    await expect(page.getByText("Open and ready to be picked up.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Request" })).toBeVisible();
    await expect(getRouter().refresh).not.toHaveBeenCalled();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

export const CreatedHiddenByFilters: Story = {
  render: () => <ListFixture />,
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/", query: { status: "done" } } } },
  beforeEach: () => { mocked(saveRequest).mockResolvedValue({ success: true, requestId, created: createdRow }); },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("link", { name: "Refund emails show the wrong total" })).toBeVisible();
    const { page } = await createFromList(canvasElement);
    // The Done view leaves the new Request out. The toast says so, and the filters stay.
    await expect(await page.findByText("It’s hidden by your current filters.")).toBeVisible();
    await expect(canvas.queryByRole("link", { name: source.title })).not.toBeInTheDocument();
    await expect(page.queryByRole("button", { name: "Open Request" })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "Show it" }));
    // Show it moves to the smallest view that holds it and focuses the row.
    // Plan item 2.4: the row, the list's one tab stop, takes focus.
    const link = await canvas.findByRole("link", { name: source.title });
    const row = link.closest<HTMLElement>('[role="row"]')!;
    await waitFor(() => expect(row).toHaveFocus());
    await expect(within(canvas.getByRole("rowgroup", { name: "Open Requests" })).getByRole("link", { name: source.title })).toBe(link);
    await expect(canvas.queryByRole("link", { name: "Refund emails show the wrong total" })).not.toBeInTheDocument();
    await expect(getRouter().refresh).not.toHaveBeenCalled();
  },
};

export const ShowItAfterLeavingTheList: Story = {
  render: () => <LeavableListFixture />,
  beforeEach: () => {
    mocked(saveRequest).mockResolvedValue({ success: true, requestId, created: createdRow });
    return () => { mocked(usePathname).mockRestore(); };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The Done view leaves the new Request out. (A query would stay in this
    // fixture's URL, since its router does not navigate.)
    await userEvent.click(canvas.getByRole("button", { name: "Show the Done view fixture" }));
    await expect(await canvas.findByRole("link", { name: "Refund emails show the wrong total" })).toBeVisible();
    const { page } = await createFromList(canvasElement);
    await expect(await page.findByText("It’s hidden by your current filters.")).toBeVisible();
    // The toast outlives the page: the person opens something else first.
    mocked(usePathname).mockReturnValue(`/requests/${listRows[1].id}`);
    await userEvent.click(canvas.getByRole("button", { name: "Leave the list fixture" }));
    await expect(canvas.queryByRole("rowgroup", { name: "Done Requests" })).not.toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "Show it" }));
    // Show it goes back to the list, in the smallest view that holds the new Request.
    await expect(getRouter().push).toHaveBeenCalledWith("/?status=open");
    // The router is a fixture here, so the story makes the navigation itself.
    mocked(usePathname).mockReturnValue("/");
    await userEvent.click(canvas.getByRole("button", { name: "Back to the list fixture" }));
    // Plan item 2.4: the row, the list's one tab stop, takes focus.
    const link = await canvas.findByRole("link", { name: source.title });
    const row = link.closest<HTMLElement>('[role="row"]')!;
    await waitFor(() => expect(row).toHaveFocus());
    await expect(within(canvas.getByRole("rowgroup", { name: "Open Requests" })).getByRole("link", { name: source.title })).toBe(link);
  },
};

/** Plan item 2.4: the row is the list's one tab stop, so focus comes back to the row, not its title link. */
const createdRowOf = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>(`[role="row"][data-request-id="${requestId}"]`);

export const CFromThePageFocusesTheNewRow: Story = {
  render: () => <ListFixture />,
  beforeEach: () => { mocked(saveRequest).mockResolvedValue({ success: true, requestId, created: createdRow }); },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // C with nothing focused names no trigger. Closing must never leave focus on the document.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard("c");
    const composer = within(await page.findByRole("dialog", { name: "New Request" }));
    await waitFor(() => expect(composer.getByRole("textbox", { name: "Request title" })).toHaveFocus());
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await composer.findByRole("button", { name: "Create Request" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await waitFor(() => expect(createdRowOf(canvasElement)).toHaveFocus());
  },
};

/** An empty workspace: the welcome's New Request leaves when the first Request lands (plan item 2.1). */
function WelcomeFixture() {
  return <RequestListViewProvider><PendingMutationsProvider>
    <NewRequestProvider context={context} draftOwnerId={draftOwnerId}>
      <WorkspaceSidebarFixture role="admin" pathname="/" projects={[]} requests={[]} orgId={context.orgId}>
        <RequestsOverview requests={[]} isGuest={false} canInvite context={context} />
      </WorkspaceSidebarFixture>
    </NewRequestProvider>
  </PendingMutationsProvider></RequestListViewProvider>;
}

export const WelcomeCreateFocusesTheNewRow: Story = {
  render: () => <WelcomeFixture />,
  beforeEach: () => { mocked(saveRequest).mockResolvedValue({ success: true, requestId, created: { ...createdRow, requestNumber: 1 } }); },
  play: async ({ canvasElement }) => {
    const { trigger } = await createFromList(canvasElement);
    await waitFor(() => expect(trigger).not.toBeInTheDocument());
    const row = await waitFor(() => { const found = createdRowOf(canvasElement); expect(found).not.toBeNull(); return found!; });
    await waitFor(() => expect(row).toHaveFocus());
    await expect(row.querySelector(`#request-${requestId}`)).not.toHaveFocus();
  },
};

async function reachUploads(canvasElement: HTMLElement) {
  const opened = await openComposer(canvasElement);
  await fillComposer(opened.composer);
  await userEvent.upload(opened.composer.getByLabelText("Choose Request files"), new File(["Customer interview notes"], "interview-notes.txt", { type: "text/plain" }));
  await userEvent.click(opened.composer.getByRole("button", { name: "Review Request" }));
  await userEvent.click(await opened.composer.findByRole("button", { name: "Create Request" }));
  return opened;
}

export const UploadProgress: Story = {
  beforeEach: () => { mocked(prepareAttachmentUpload).mockImplementation(() => new Promise(() => {})); },
  play: async ({ canvasElement }) => {
    const { composer, dialog } = await reachUploads(canvasElement);
    const heading = await composer.findByRole("heading", { name: "Uploading files", level: 2 });
    await waitFor(() => expect(heading).toBeVisible());
    await expect(composer.getByRole("progressbar", { name: "Uploading interview-notes.txt" })).toBeVisible();
    await expect(composer.queryByText("Request created")).not.toBeInTheDocument();
    // This tab remembers the unfinished file, so a reload can say so (S3).
    await waitFor(() => expect(readUnfinishedUploads(window.sessionStorage, scope)?.files.map((file) => file.name)).toEqual(["interview-notes.txt"]));
    await userEvent.keyboard("{Escape}");
    await expect(dialog).toBeVisible();
  },
};

export const UploadRecovery: Story = {
  play: async ({ canvasElement }) => {
    const { composer, page } = await reachUploads(canvasElement);
    const heading = await composer.findByRole("heading", { name: "Some files weren’t uploaded" });
    await waitFor(() => expect(heading).toBeVisible());
    await expect(composer.getByRole("button", { name: "Retry upload" })).toBeVisible();
    await expect(readUnfinishedUploads(window.sessionStorage, scope)?.requestId).toBe(requestId);
    await userEvent.click(composer.getByRole("button", { name: "Skip failed files" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull();
    await expect(await page.findByText("Open and ready to be picked up.")).toBeVisible();
    await expect(saveRequest).toHaveBeenCalledTimes(1);
  },
};

export const AllFailedFilesRemovedOpensRequest: Story = {
  play: async ({ canvasElement }) => {
    const { composer, page } = await reachUploads(canvasElement);
    const heading = await composer.findByRole("heading", { name: "Some files weren’t uploaded" });
    await waitFor(() => expect(heading).toBeVisible());
    await userEvent.click(composer.getByRole("button", { name: "Remove" }));
    // S3: the label says what the button does, and it does it.
    const open = await composer.findByRole("button", { name: "Open Request" });
    await expect(composer.queryByRole("button", { name: "View Request" })).not.toBeInTheDocument();
    await userEvent.click(open);
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith(`/requests/${requestId}`));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await expect(page.queryByText("Open and ready to be picked up.")).not.toBeInTheDocument();
    await expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull();
  },
};

// Stories share one document, so a record "left before a reload" names an earlier one.
const beforeReload = () => performance.timeOrigin - 60_000;

function leaveLostUploads() {
  writeUnfinishedUploads(window.sessionStorage, scope, {
    requestId,
    title: source.title,
    origin: beforeReload(),
    files: [
      { key: "lost-finished", name: "interview-notes.txt", attachmentId: "00000000-0000-4000-8000-0000000000a1" },
      { key: "lost-reserved", name: "checkout-flow.png", attachmentId: "00000000-0000-4000-8000-0000000000a2" },
      { key: "lost-unstarted", name: "support-tickets.csv", attachmentId: null },
    ],
  });
}

export const UploadsLostAfterReload: Story = {
  beforeEach: () => {
    leaveLostUploads();
    // The first file did finish before the reload; the second was only reserved.
    mocked(discardAttachmentUpload).mockImplementation(async ({ attachmentId }) => attachmentId.endsWith("a1") ? { success: true, alreadyUploaded: true } : { success: true });
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // After the reload the composer opens once by itself and says which files weren't added.
    const dialog = await page.findByRole("dialog", { name: "New Request" });
    const composer = within(dialog);
    const heading = await composer.findByRole("heading", { name: "Some files weren’t added", level: 2 });
    await waitFor(() => expect(heading).toHaveFocus());
    // The step fades in, so its copy is checked once the fade is done.
    await waitFor(() => expect(composer.getByText(/the page reloaded before these files finished uploading/)).toBeVisible());
    // The list shows only once every reservation is checked: the finished file never appears.
    const files = within(composer.getByRole("list", { name: "Files that weren’t added" }));
    await expect(files.queryByText("interview-notes.txt")).not.toBeInTheDocument();
    await expect(files.getByText("checkout-flow.png")).toBeVisible();
    await expect(files.getByText("support-tickets.csv")).toBeVisible();
    await expect(discardAttachmentUpload).toHaveBeenCalledTimes(2);
    await expect(prepareAttachmentUpload).not.toHaveBeenCalled();
    await userEvent.click(composer.getByRole("button", { name: "Open Request" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith(`/requests/${requestId}`));
    await expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull();
  },
};

export const UploadsLostDismissed: Story = {
  beforeEach: UploadsLostAfterReload.beforeEach,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const composer = within(await page.findByRole("dialog", { name: "New Request" }));
    await composer.findByRole("heading", { name: "Some files weren’t added" });
    await userEvent.click(composer.getByRole("button", { name: "Dismiss" }));
    // A fresh compose step; the record is gone, so a later reload says nothing.
    const title = await composer.findByRole("textbox", { name: "Request title" });
    await waitFor(() => expect(title).toHaveFocus());
    await expect(title).toHaveValue("");
    await expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull();
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

let pendingCheck: () => void = () => {};

export const UploadsLostWaitsForTheCheck: Story = {
  beforeEach: () => {
    leaveLostUploads();
    let release: () => void = () => {};
    const checked = new Promise<void>((resolve) => { release = resolve; });
    mocked(discardAttachmentUpload).mockImplementation(async ({ attachmentId }) => {
      await checked;
      return attachmentId.endsWith("a1") ? { success: true, alreadyUploaded: true } : { success: true };
    });
    pendingCheck = () => release();
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const composer = within(await page.findByRole("dialog", { name: "New Request" }));
    // While the reservations are checked, no list and no action can show, so
    // nothing can resolve the step before the check writes its answer.
    const checking = await composer.findByRole("status", { name: "Checking your files" });
    await waitFor(() => expect(checking).toBeVisible());
    await expect(composer.queryByRole("heading", { name: "Some files weren’t added" })).not.toBeInTheDocument();
    await expect(composer.queryByRole("button", { name: "Dismiss" })).not.toBeInTheDocument();
    await expect(composer.queryByRole("button", { name: "Open Request" })).not.toBeInTheDocument();
    pendingCheck();
    await waitFor(() => expect(composer.getByRole("heading", { name: "Some files weren’t added" })).toHaveFocus());
    await expect(within(composer.getByRole("list", { name: "Files that weren’t added" })).getAllByRole("listitem")).toHaveLength(2);
    await userEvent.click(composer.getByRole("button", { name: "Dismiss" }));
    await expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull();
  },
};

export const UploadsAllFinishedAfterReload: Story = {
  beforeEach: () => {
    writeUnfinishedUploads(window.sessionStorage, scope, {
      requestId,
      title: source.title,
      origin: beforeReload(),
      files: [{ key: "lost-finished", name: "interview-notes.txt", attachmentId: "00000000-0000-4000-8000-0000000000a1" }],
    });
    mocked(discardAttachmentUpload).mockResolvedValue({ success: true, alreadyUploaded: true });
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // Every file had finished before the reload: nothing was lost, so the flow
    // ends as a creation does, with no list and no empty composer.
    await expect(await page.findByText("Open and ready to be picked up.")).toBeVisible();
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await expect(page.queryByText("Some files weren’t added")).not.toBeInTheDocument();
    await expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull();
    await userEvent.click(page.getByRole("button", { name: "Open Request" }));
    await expect(getRouter().push).toHaveBeenCalledWith(`/requests/${requestId}`);
  },
};

export const UploadsFromThisDocumentAreNotLost: Story = {
  // A record this document wrote, as one left after Leave page, or by a
  // composer whose host unmounted while its files were still uploading. No
  // reload happened.
  beforeEach: () => {
    writeUnfinishedUploads(window.sessionStorage, scope, {
      requestId,
      title: source.title,
      files: [{ key: "in-flight", name: "interview-notes.txt", attachmentId: "00000000-0000-4000-8000-0000000000a1" }],
    });
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(page.getByText("Existing workspace Requests remain here while you compose.")).toBeVisible());
    await new Promise((resolve) => setTimeout(resolve, 300));
    await expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument();
    const { composer } = await openComposer(canvasElement);
    await expect(composer.getByRole("textbox", { name: "Request title" })).toHaveValue("");
    await expect(composer.queryByText("Some files weren’t added")).not.toBeInTheDocument();
    // The upload still running elsewhere in this document keeps its reservation.
    await expect(discardAttachmentUpload).not.toHaveBeenCalled();
    await expect(readUnfinishedUploads(window.sessionStorage, scope)?.requestId).toBe(requestId);
  },
};

/** Samples the open composer dialog in every frame for `ms` after `start` runs. */
async function samplePanel(start: () => Promise<unknown>, ms: number) {
  const samples: { at: number; transform: string; opacity: number }[] = [];
  let running = true;
  const frame = (at: number) => {
    const panel = document.querySelector<HTMLElement>('[role="dialog"][data-layout="composer"]');
    if (panel) { const style = getComputedStyle(panel); samples.push({ at, transform: style.transform, opacity: Number(style.opacity) }); }
    if (running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  await start();
  await new Promise((resolve) => setTimeout(resolve, ms));
  running = false;
  return samples;
}

const still = (transform: string) => transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)";

export const ReducedMotion: Story = {
  beforeEach: restoreLegacyEmptyDraft,
  // Decision 8.22. Under prefers-reduced-motion (the visual harness, or
  // STORYBOOK_REDUCED_MOTION=reduce) the panel only fades.
  // Otherwise the panel settles within the
  // 240 ms panel budget, plus three frames of sampling slack.
  play: async ({ canvasElement }) => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const samples = await samplePanel(() => openComposer(canvasElement), 450);
    await expect(samples.length).toBeGreaterThan(0);
    await expect(still(samples.at(-1)!.transform)).toBe(true);
    await expect(samples.at(-1)!.opacity).toBe(1);
    if (reduce) {
      await expect(samples.every((sample) => still(sample.transform))).toBe(true);
    } else {
      // Timed from the last frame at the entrance's start: the frame that mounts the
      // form comes first and is the C budget's concern, not the motion's.
      const moving = samples.findIndex((sample) => sample.transform !== samples[0].transform);
      const settled = samples.find((sample) => still(sample.transform));
      await expect(moving).toBeGreaterThan(0);
      await expect(settled!.at - samples[moving - 1].at).toBeLessThanOrEqual(240 + 50);
    }
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "New Request" });
    // The overlay (the panel's sibling in the portal) reads the theme's token, with no blur.
    const overlay = dialog.previousElementSibling as HTMLElement;
    await expect(overlay).toHaveAttribute("data-state", "open");
    await expect(getComputedStyle(overlay).backdropFilter).toBe("none");
    await expect(getComputedStyle(overlay).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    const panel = within(dialog).getByRole("region", { name: "Request measurement" });
    if (reduce) await expect(getComputedStyle(panel).opacity).toBe("1");
    await waitFor(() => expect(getComputedStyle(panel).opacity).toBe("1"));
  },
};

// The centred dialog (2026-10-13): /intake is a launcher under the page strip,
// and the composer opens over whatever page holds it.

/** The list context a person brings from "/" when they reach /intake in the app: every Project. */
function ListViewFromTheList() {
  const setView = useSetRequestListView();
  useEffect(() => { setView((view) => withListContext(view, { status: "all", project: "all" })); }, [setView]);
  return null;
}

/** /intake as intake/page.tsx renders it, under the (app) layout's list state and composer. */
function IntakeLauncherFixture() {
  return <RequestListViewProvider><ListViewFromTheList /><PendingMutationsProvider>
    <NewRequestProvider context={context} draftOwnerId={draftOwnerId}>
      <main className="p-6"><IntakeLauncher /></main>
    </NewRequestProvider>
  </PendingMutationsProvider></RequestListViewProvider>;
}

export const IntakeProjectPreselects: Story = {
  // NewRequestLink writes /intake?project=; the layout's list context mirrors only "/", so the URL names the Project here.
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/intake", query: { project: "00000000-0000-4000-8000-000000000456" } } } },
  render: () => <IntakeLauncherFixture />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const link = within(canvasElement).getByRole("link", { name: "Create Request" });
    await expect(link).toHaveAttribute("href", "/intake?project=00000000-0000-4000-8000-000000000456");
    await expect(link).toHaveAttribute("aria-haspopup", "dialog");
    await userEvent.click(link);
    const composer = within(await page.findByRole("dialog", { name: "New Request" }));
    await waitFor(() => expect(composer.getByRole("button", { name: "Project: Website" })).toBeVisible());
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("button", { name: "Create Request" })).toBeVisible());
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ projectId: "00000000-0000-4000-8000-000000000456" }), context);
  },
};

export const UploadsLostOpensOnIntake: Story = {
  // A reload on /intake also opens the composer once by itself (plan item 2.3, S3).
  parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/intake", query: {} } } },
  render: () => <IntakeLauncherFixture />,
  beforeEach: UploadsLostAfterReload.beforeEach,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const composer = within(await page.findByRole("dialog", { name: "New Request" }));
    const heading = await composer.findByRole("heading", { name: "Some files weren’t added", level: 2 });
    await waitFor(() => expect(heading).toHaveFocus());
    const files = within(composer.getByRole("list", { name: "Files that weren’t added" }));
    await expect(files.getAllByRole("listitem")).toHaveLength(2);
    await expect(files.getByRole("listitem", { name: "checkout-flow.png" })).toHaveTextContent("Not added");
    await expect(files.queryByRole("button")).not.toBeInTheDocument();
    await userEvent.click(composer.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(composer.getByRole("textbox", { name: "Request title" })).toHaveFocus());
    await expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull();
    // The composer opened by itself, so closing it returns focus to the launcher, not the document.
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await waitFor(() => expect(within(canvasElement).getByRole("link", { name: "Create Request" })).toHaveFocus());
  },
};

const intakeArrival = { nextjs: { appDirectory: true, navigation: { pathname: "/intake", query: {} } } };
const storedReview = { triage: { classification: "problem" as const, reframedProblem: null, extractedSolution: null }, token: "story-composer-review-token", editedProblem: "" };
const launcherOf = (canvasElement: HTMLElement) => within(canvasElement).getByRole("link", { name: "Create Request" });

export const IntakeRestoresReviewOnArrival: Story = {
  // A reload or Sign in again on /intake brings back this tab's review, as 2.3's page did:
  // the composer opens by itself with the review heading focused.
  parameters: intakeArrival,
  render: () => <IntakeLauncherFixture />,
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, scope, { source: { ...bareSource, expectedImpact: metricImpact }, review: storedReview });
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const composer = within(await page.findByRole("dialog", { name: "New Request" }));
    const heading = await composer.findByRole("heading", { name: "Review Request", level: 2 });
    await waitFor(() => expect(heading).toHaveFocus());
    await waitFor(() => expect(composer.getByText(/Your review was restored\./)).toBeVisible());
    await expect(composer.getByRole("heading", { name: source.title, level: 3 })).toBeVisible();
    await expect(composer.getByRole("button", { name: "Create Request" })).toBeVisible();
    await expect(runTriage).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await waitFor(() => expect(launcherOf(canvasElement)).toHaveFocus());
    // Once per arrival: the launcher stays, and the review waits behind Create Request.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument();
    await expect(readIntakeDraft(window.sessionStorage, scope)?.review?.token).toBe(storedReview.token);
    await userEvent.click(launcherOf(canvasElement));
    const reopened = within(await page.findByRole("dialog", { name: "New Request" }));
    await waitFor(() => expect(reopened.getByRole("heading", { name: "Review Request", level: 2 })).toHaveFocus());
  },
};

export const IntakeRestoresDraftOnArrival: Story = {
  parameters: intakeArrival,
  render: () => <IntakeLauncherFixture />,
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, scope, { source: { ...bareSource, expectedImpact: metricImpact }, review: null });
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const composer = within(await page.findByRole("dialog", { name: "New Request" }));
    const title = await composer.findByRole("textbox", { name: "Request title" });
    await waitFor(() => expect(title).toHaveValue(source.title));
    await waitFor(() => expect(title).toHaveFocus());
    // The dialog is still fading in when the draft lands, so the notice becomes visible a frame later.
    await waitFor(() => expect(composer.getByText("Draft restored")).toBeVisible());
    // One announcement, as when Create Request opens it (DraftRestored).
    const restoredLine = "Your unsaved Request was restored.";
    await expect(composer.getByText(restoredLine)).toHaveAttribute("role", "status");
    await expect(canvasElement.ownerDocument.body.textContent?.split(restoredLine)).toHaveLength(2);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await waitFor(() => expect(launcherOf(canvasElement)).toHaveFocus());
  },
};

export const IntakeWithoutDraftShowsLauncher: Story = {
  parameters: intakeArrival,
  render: () => <IntakeLauncherFixture />,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    // The arrival check runs in a task after hydration.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument();
    await expect(launcherOf(canvasElement)).toBeVisible();
  },
};

export const IntakeCreateOpensRequest: Story = {
  // /intake has no list to show the new Request in. As 2.3's page did, creating there opens it.
  parameters: intakeArrival,
  render: () => <IntakeLauncherFixture />,
  beforeEach: () => { mocked(saveRequest).mockResolvedValue({ success: true, requestId, created: createdRow }); },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(launcherOf(canvasElement));
    const composer = within(await page.findByRole("dialog", { name: "New Request" }));
    await composer.findByRole("textbox", { name: "Request title" });
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await composer.findByRole("button", { name: "Create Request" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith(`/requests/${requestId}`));
    await expect(await page.findByText("Request created")).toBeVisible();
    await expect(page.queryByRole("button", { name: "Open Request" })).not.toBeInTheDocument();
  },
};

let leaveForAnotherPage: (() => void) | undefined;
let finishSave: (() => void) | undefined;

/** The composer over a page the person then leaves with the browser's Back: the layout, and the composer, stay. */
function RouteChangeFixture() {
  const [away, setAway] = useState(false);
  useEffect(() => {
    leaveForAnotherPage = () => setAway(true);
    return () => { leaveForAnotherPage = undefined; };
  }, []);
  return <NewRequestProvider context={context} draftOwnerId={draftOwnerId}>
    <main className="space-y-6 p-6">
      {away ? <h1>Another page</h1> : <><h1>Requests</h1><NewRequestLink>New Request</NewRequestLink></>}
    </main>
  </NewRequestProvider>;
}

export const RouteChangeWhileSaving: Story = {
  render: () => <RouteChangeFixture />,
  beforeEach: () => {
    finishSave = undefined;
    mocked(saveRequest).mockImplementation(() => new Promise((resolve) => { finishSave = () => resolve({ success: true, requestId }); }));
    return () => { mocked(usePathname).mockRestore(); };
  },
  play: async ({ canvasElement }) => {
    const { composer, page } = await reachReview(canvasElement);
    await userEvent.click(await composer.findByRole("button", { name: "Create Request" }));
    await waitFor(() => expect(finishSave).toBeDefined());
    // The route changes under the open dialog while the save is pending.
    mocked(usePathname).mockReturnValue("/settings/profile");
    leaveForAnotherPage?.();
    // Radix hides the page behind the modal from assistive tech, so the page is found by its text.
    await expect(await within(canvasElement).findByText("Another page")).toBeInTheDocument();
    await expect(page.getByRole("dialog", { name: "New Request" })).toBeVisible();
    finishSave?.();
    // The save ends the composer: it closes, the toast speaks, and nothing navigates.
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await expect(await page.findByText("Request created")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Request" })).toBeVisible();
    await expect(getRouter().push).not.toHaveBeenCalled();
    await expect(getRouter().refresh).not.toHaveBeenCalled();
    await expect(saveRequest).toHaveBeenCalledTimes(1);
  },
};

export const CompactLabelsMenu: Story = {
  play: async ({ canvasElement }) => {
    const { composer, page } = await openComposer(canvasElement);
    await userEvent.click(composer.getByRole("button", { name: "Labels" }));
    const list = await page.findByRole("group", { name: "Available labels" });
    await expect(within(list).getAllByRole("checkbox")).toHaveLength(3);
    await waitFor(() => expect(page.getByRole("textbox", { name: "Search labels" })).toHaveFocus());
    await userEvent.keyboard("{ArrowDown}");
    await expect(page.getByRole("checkbox", { name: "Bug" })).toHaveFocus();
    await userEvent.keyboard(" ");
    await expect(page.getByRole("checkbox", { name: "Bug" })).toBeChecked();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(composer.getByRole("button", { name: "Labels: Bug" })).toHaveFocus());
    await expect(page.getByRole("dialog", { name: "New Request" })).toBeVisible();
    await userEvent.click(composer.getByRole("button", { name: "Labels: Bug" }));
    await expect(page.getByRole("checkbox", { name: "Bug" })).toBeChecked();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(composer.getByRole("button", { name: "Labels: Bug" })).toHaveFocus());
  },
};

export const GuardrailDraftInComposer: Story = {
  beforeEach: restoreLegacyEmptyDraft,
  play: async ({ canvasElement }) => {
    const { composer, page, dialog } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", {name:"Add guardrail"}));
    let row=within(composer.getByRole("region",{name:"Guardrail 1"}));
    await userEvent.click(row.getByRole("combobox",{name:"Guardrail metric"}));
    await userEvent.click(await page.findByRole("option",{name:"Support contact rate"}));
    await waitFor(()=>expect(row.getByRole("combobox",{name:"Guardrail metric"})).toHaveFocus());
    await userEvent.click(row.getByRole("combobox",{name:"Comparison"}));
    await userEvent.click(await page.findByRole("option",{name:"Greater than or equal to"}));
    await waitFor(()=>expect(row.getByRole("combobox",{name:"Comparison"})).toHaveFocus());
    await expect(composer.getByRole("button",{name:"Review Request"})).toBeDisabled();
    await expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth+1);
    await userEvent.keyboard("{Escape}");
    await waitFor(()=>expect(page.queryByRole("dialog",{name:"New Request"})).not.toBeInTheDocument());
    const reopened=await openComposer(canvasElement);
    row=within(reopened.composer.getByRole("region",{name:"Guardrail 1"}));
    await expect(row.getByRole("combobox",{name:"Guardrail metric"})).toHaveTextContent("Support contact rate");
    await expect(row.getByRole("combobox",{name:"Comparison"})).toHaveTextContent("Greater than or equal to");
    await expect(row.getByRole("spinbutton",{name:"Value"})).toHaveValue(null);
    await expect(reopened.composer.getByRole("button",{name:"Review Request"})).toBeDisabled();
    await userEvent.type(row.getByRole("spinbutton",{name:"Value"}),"80");
    await userEvent.click(reopened.composer.getByRole("button",{name:"Review Request"}));
    await waitFor(()=>expect(reopened.composer.getByText("Support contact rate must stay at or above 80 %.")).toBeVisible());
  },
};

export const GuardrailDraftReopensPane: Story = {
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId), {
      source: { ...source, affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: null, requestType: null,
        expectedImpact: { ...metricImpact, guardrail: { metric: "Support requests", operator: "at_most", limit: null, unit: "requests per week" }, guardrailEdit: { previous: null } } },
      review: null,
    });
  },
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await expect(await composer.findByRole("region", { name: "Guardrail 1" })).toBeVisible();
    await expect(within(composer.getByRole("region", { name: "Guardrail 1" })).getByRole("combobox", { name: "Guardrail metric" })).toHaveTextContent("Support requests");
    await userEvent.click(composer.getByRole("button", { name: "Cancel guardrail" }));
    await expect(composer.getByRole("button", { name: "Review Request" })).toBeEnabled();
  },
};
