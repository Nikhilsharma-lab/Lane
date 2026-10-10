import { listProjects, createProject } from "@/app/(app)/intake/project-actions";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";

import { runTriage, saveRequest } from "@/app/(app)/intake/actions";
import { prepareAttachmentUpload, finalizeAttachmentUpload, discardAttachmentUpload } from "@/app/(app)/intake/attachment-actions";
import { RequestWorkspaceKeyboard } from "@/app/(app)/request-workspace-keyboard";
import { RequestsOverview } from "@/app/(app)/requests-overview";
import { NewRequestLink, NewRequestProvider } from "@/components/requests/new-request-provider";
import { SidebarView } from "@/components/shell/sidebar-view";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/arc/dialog/dialog";
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import { clearIntakeDraft, intakeDraftScope, writeIntakeDraft } from "@/lib/intake-draft";
import { fillMetricImpact, metricImpact } from "./fixtures/request-impact";
import { WorkspaceProjectsProvider, useSharedWorkspaceProjects } from "@/components/projects/workspace-projects-provider";
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
  beforeEach: () => {
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [{ id: "00000000-0000-4000-8000-000000000456", name: "Website", description: null }] });
    mocked(createProject).mockReset().mockResolvedValue({ success: true, project: { id: "00000000-0000-4000-8000-000000000789", name: "Marketing", description: null } });
    getRouter().push.mockClear();
    getRouter().refresh.mockClear();
    profileNavigation.mockClear();
    clearIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId));
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
  if (expectCompose) await composer.findByRole("textbox", { name: "Request title" });
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
  await waitFor(() => expect(within(surface).getByRole("searchbox", { name: "Search Projects" })).toBeVisible());
  return within(surface);
}

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const { composer, dialog } = await openComposer(canvasElement);
    await waitFor(() => expect(composer.getByRole("textbox", { name: "Request title" })).toHaveFocus());
    await expect(composer.getByRole("textbox", { name: "Description" })).toBeVisible();
    await expect(composer.getByRole("button", { name: "Review Request" })).toBeEnabled();
    await expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(window.innerWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
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
    await waitForInteractive(composer.getByRole("button", { name: "Request type" }));
    await userEvent.click(composer.getByRole("button", { name: "Request type" }));
    await userEvent.click(await page.findByRole("radio", { name: /Improvement An existing/ }));
    await expect(dialog).toHaveAttribute("data-state", "open");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Choose a Request type" })).not.toBeInTheDocument());
    await waitForInteractive(composer.getByRole("button", { name: "Review Request" }));
    await userEvent.click(composer.getByRole("button", { name: "Add link" }));
    await userEvent.type(composer.getByRole("textbox", { name: "Related link" }), "https://example.test/customer-interviews");
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

export const OptionalRequestProperties: Story = {
  play: async ({ canvasElement }) => {
    const { composer } = await openComposer(canvasElement);
    await expect(composer.getByRole("button", { name: "Project" })).toBeVisible();
    await expect(composer.getByRole("button", { name: "Request type" })).toBeVisible();
    await expect(composer.getByRole("textbox", { name: "Request title" })).toBeVisible();
    await expect(composer.getByRole("textbox", { name: "Description" })).toBeVisible();
    await expect(composer.queryByRole("button", { name: "Details" })).not.toBeInTheDocument();
    await expect(composer.queryByRole("button", { name: "Feedback & links" })).not.toBeInTheDocument();
    await expect(composer.queryByRole("region", { name: "Details from your earlier draft" })).not.toBeInTheDocument();
    for (const label of ["Who is affected?", "What should people be able to do?", "Examples or feedback", "What do you still need to find out?"]) {
      await expect(composer.queryByLabelText(label)).not.toBeInTheDocument();
    }
    await expect(composer.getByRole("button", { name: "Attach files" })).toBeVisible();
    await expect(composer.queryByRole("textbox", { name: "Related link" })).not.toBeInTheDocument();
    await userEvent.click(composer.getByRole("button", { name: "Add link" }));
    await expect(composer.getByRole("textbox", { name: "Related link" })).toBeVisible();
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
    await expect(reopened.composer.getByRole("textbox", { name: /^Metric/ })).toHaveValue(metricImpact.metric);
    await expect(reopened.composer.getByRole("spinbutton", { name: /^Current value/ })).toHaveValue(null);
    await expect(reopened.composer.getByRole("spinbutton", { name: /^Target value/ })).toHaveValue(90);
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
    await userEvent.click(composer.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(composer.getByRole("heading", { name: "Review Request" })).toBeVisible());
    await expect(runTriage).toHaveBeenCalledTimes(1);
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: metricImpact }), context);
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
    await expect(await composer.findByRole("button", { name: "Preparing review…" })).toBeDisabled();
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
    await expect(await composer.findByRole("button", { name: "Creating Request…" })).toBeDisabled();
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

export const InWorkspace: Story = {
  render: () => (
    <NewRequestProvider context={context} draftOwnerId={draftOwnerId}>
      <SidebarView workspaceName="Lane Studio" fullName="Alex Morgan" email="alex@example.test" role="member" pathname="/" statusFilter="all" notifications={null} onSignOut={() => {}}>
        <RequestsOverview filter="all" isGuest={false} requests={[
          { id: "example-1", title: "Customers cannot find the delivery date before checkout", status: "open", reframedProblem: null, creatorName: "Alex Morgan", assigneeName: null, createdAt: "2026-10-05T09:00:00.000Z" },
          { id: "example-2", title: "New teammates do not know which workspace to join", status: "in_progress", reframedProblem: null, creatorName: "Jordan Patel", assigneeName: "Sam Lee", createdAt: "2026-10-04T09:00:00.000Z" },
        ]} />
      </SidebarView>
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
    const opener = await canvas.findByRole("button", { name: "Open navigation" });
    await userEvent.click(opener);
    const navigation = within(await page.findByRole("dialog", { name: "Navigation" }));
    await userEvent.click(navigation.getByRole("link", { name: "New Request" }));
    const dialog = await page.findByRole("dialog", { name: "New Request" });
    const title = await within(dialog).findByRole("textbox", { name: "Request title" });
    await waitFor(() => expect(title).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await expect(await page.findByRole("dialog", { name: "Navigation" })).toBeVisible();
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
  render: () => <NewRequestProvider context={context} draftOwnerId={draftOwnerId}><main className="p-6"><NewRequestLink>New Request</NewRequestLink><Input id="intake-title" label="Existing Intake title" /></main></NewRequestProvider>,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("link", { name: "New Request" });
    await expect(link).not.toHaveAttribute("aria-haspopup");
    await userEvent.click(link);
    await expect(within(document.body).queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument();
    link.focus();
    await userEvent.keyboard("c");
    await expect(canvas.getByRole("textbox", { name: "Existing Intake title" })).toHaveFocus();
  },
};

export const PropertiesSaveAndRestore: Story = {
  play: async ({ canvasElement }) => {
    const { page, dialog, composer } = await openComposer(canvasElement);
    await fillComposer(composer);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    await userEvent.click(await (await projectSurface(page)).findByRole("option", { name: "Website" }));
    await expect(dialog).toHaveAttribute("data-state", "open");
    await waitForInteractive(composer.getByRole("button", { name: "Request type" }));
    await userEvent.click(composer.getByRole("button", { name: "Request type" }));
    await userEvent.click(await page.findByRole("radio", { name: /Bug Something fails/ }));
    await expect(dialog).toHaveAttribute("data-state", "open");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Choose a Request type" })).not.toBeInTheDocument());
    await waitForInteractive(composer.getByRole("textbox", { name: "Request title" }));
    await expect(composer.getByRole("button", { name: "Project: Website" })).toBeVisible();
    await userEvent.click(composer.getByRole("textbox", { name: "Request title" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument());
    const reopened = await openComposer(canvasElement);
    await expect(reopened.composer.getByRole("button", { name: "Project: Website" })).toBeVisible();
    await expect(reopened.composer.getByRole("button", { name: "Request type: Bug" })).toBeVisible();
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
    const search = project.getByRole("searchbox", { name: "Search Projects" });
    await userEvent.type(search, "Marketing");
    await userEvent.click(await project.findByRole("option", { name: "Create “Marketing”" }));
    await waitFor(async () => expect(await composer.findByRole("button", { name: "Project: Marketing" })).toBeVisible());
    await expect(createProject).toHaveBeenCalledWith({ name: "Marketing" }, context);
    await expect(getRouter().push).not.toHaveBeenCalled();
    await waitFor(() => expect(composer.getByRole("button", { name: "Project: Marketing" }).querySelector('[data-motion-pop-id][aria-hidden="true"]')).toBeNull());
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
    await userEvent.type(project.getByRole("searchbox", { name: "Search Projects" }), "Marketing");
    await userEvent.click(await project.findByRole("option", { name: "Create “Marketing”" }));
    await expect(await composer.findByRole("button", { name: "Project: Marketing" })).toBeVisible();
    await expect(canvas.getByLabelText("Shared Project options")).toHaveTextContent("Marketing, Website");
    await waitFor(() => expect(composer.getByRole("button", { name: "Project: Marketing" }).querySelector('[data-motion-pop-id][aria-hidden="true"]')).toBeNull());
  },
};

export const ExistingProjectAndClear: Story = {
  play: async ({ canvasElement }) => {
    const { page, dialog, composer } = await openComposer(canvasElement);
    await userEvent.click(composer.getByRole("button", { name: "Project" }));
    const project = await projectSurface(page);
    await userEvent.type(project.getByRole("searchbox", { name: "Search Projects" }), "website");
    await expect(project.queryByRole("option", { name: /Create/ })).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await waitFor(async () => expect(await composer.findByRole("button", { name: "Project: Website" })).toBeVisible());
    await waitFor(() => expect(composer.getByRole("button", { name: "Project: Website" })).toHaveAttribute("aria-expanded", "false"));
    await waitForInteractive(composer.getByRole("button", { name: "Project: Website" }));
    await userEvent.click(composer.getByRole("button", { name: "Project: Website" }));
    await waitFor(() => expect(composer.getByRole("button", { name: "Project: Website" })).toHaveAttribute("aria-expanded", "true"));
    const reopenedProject = await projectSurface(page);
    const search = reopenedProject.getByRole("searchbox", { name: "Search Projects" });
    await expect(search).toHaveValue("");
    await userEvent.click(await reopenedProject.findByRole("option", { name: "No project" }));
    await waitForInteractive(composer.getByRole("button", { name: "Request type" }));
    await expect(composer.getByRole("button", { name: "Project" })).toBeVisible();
    await expect(createProject).not.toHaveBeenCalled();
    await userEvent.click(composer.getByRole("button", { name: "Request type" }));
    await userEvent.click(await page.findByRole("radio", { name: /Improvement An existing/ }));
    await waitForInteractive(composer.getByRole("button", { name: "Request type: Improvement" }));
    await userEvent.click(composer.getByRole("button", { name: "Request type: Improvement" }));
    await userEvent.click(await page.findByRole("radio", { name: /No type/ }));
    await expect(composer.getByRole("button", { name: "Request type" })).toBeVisible();
    await waitFor(() => expect(dialog.querySelector('[data-motion-pop-id][aria-hidden="true"]')).toBeNull());
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
    await userEvent.type(project.getByRole("searchbox", { name: "Search Projects" }), "Marketing");
    await userEvent.click(await project.findByRole("option", { name: "Create “Marketing”" }));
    await waitFor(async () => expect(await page.findByText("The Project could not be created. Try again.")).toBeVisible());
    await waitFor(() => expect(project.getByRole("searchbox", { name: "Search Projects" })).toHaveFocus());
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
    await userEvent.type(project.getByRole("searchbox", { name: "Search Projects" }), "Marketing");
    await userEvent.click(await project.findByRole("option", { name: "Create “Marketing”" }));
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
