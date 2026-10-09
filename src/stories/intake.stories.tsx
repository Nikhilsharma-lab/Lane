import { listProjects, createProject } from "@/app/(app)/intake/project-actions";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { SidebarView } from "@/components/shell/sidebar-view";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";

import IntakeForm from "@/app/(app)/intake/intake-form";
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import {
  clearIntakeDraft,
  intakeDraftScope,
  readIntakeDraft,
  writeIntakeDraft,
} from "@/lib/intake-draft";

import { runTriage, saveRequest } from "@/app/(app)/intake/actions";
import {
  discardAttachmentUpload,
  finalizeAttachmentUpload,
  prepareAttachmentUpload,
} from "@/app/(app)/intake/attachment-actions";
import IntakeLoading from "@/app/(app)/intake/loading";
import type { TriageResult } from "@/lib/ai/triage";
import { fillMetricImpact, metricImpact, verifiedImpact } from "./fixtures/request-impact";

const requestSource = {
  expectedImpact: metricImpact,
  title: "Customers cannot find their saved drafts",
  description:
    "Customers leave the editor and cannot find the draft when they return.",
  affectedPeople: "People returning to an unfinished Request",
  desiredChange: "",
  observedEvidence: "",
  uncertainty: "",
  usefulLink: "",
};
const problem: TriageResult = {
  classification: "problem",
  reframedProblem: null,
  extractedSolution: null,
};
const solution: TriageResult = {
  classification: "solution",
  reframedProblem:
    "People cannot reliably return to unfinished work after leaving the editor.",
  extractedSolution: null,
};
const hybrid: TriageResult = {
  classification: "hybrid",
  reframedProblem: solution.reframedProblem,
  extractedSolution: "Add a saved-drafts link to the navigation.",
};
const context = { orgId: "storybook-intake-workspace" };
const draftOwnerId = "storybook-intake-person";

const meta = {
  title: "Intake/Request flow",
  component: IntakeForm,
  args: { context, draftOwnerId },
  decorators: [
    (Story, story) => (
      <ToastStackProvider>
        {story.parameters.workspaceShell ? (
          <Story />
        ) : (
          <main className="min-h-dvh">
            <Story />
          </main>
        )}
        <ToastStack />
      </ToastStackProvider>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/intake" } },
  },
  beforeEach: () => {
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [{ id: "00000000-0000-4000-8000-000000000456", name: "Website", description: null }] });
    mocked(createProject).mockReset().mockResolvedValue({ success: true, project: { id: "00000000-0000-4000-8000-000000000789", name: "Marketing", description: null } });
    getRouter().push.mockClear();
    clearIntakeDraft(
      window.sessionStorage,
      intakeDraftScope(draftOwnerId, context.orgId),
    );
    mocked(runTriage).mockReset().mockResolvedValue({
      success: true,
      triage: problem,
      token: "story-review-token",
    });
    mocked(saveRequest).mockReset().mockResolvedValue({
      success: true,
      requestId: "00000000-0000-4000-8000-000000000123",
    });
    mocked(prepareAttachmentUpload)
      .mockReset()
      .mockResolvedValue({
        success: false,
        error: {
          code: "storage_unavailable",
          message:
            "The file did not finish uploading. Your Request was created. Retry the upload.",
        },
      });
    mocked(finalizeAttachmentUpload)
      .mockReset()
      .mockResolvedValue({ success: true });
    mocked(discardAttachmentUpload)
      .mockReset()
      .mockResolvedValue({ success: true });
  },
} satisfies Meta<typeof IntakeForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DirectReview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Request title" }),
      requestSource.title,
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Description" }),
      requestSource.description,
    );
    await fillMetricImpact(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review your Request" }));
    await expect(runTriage).toHaveBeenCalledTimes(1);
    await expect(saveRequest).not.toHaveBeenCalled();
    await expect(canvas.getByRole("button", { name: "Create Request" })).toBeEnabled();
  },
};

export const Compose: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await visible(
      canvas.getByRole("heading", { name: "New Request", level: 1 }),
    );
    await expect(canvas.queryByRole("tablist")).not.toBeInTheDocument();
    await visible(canvas.getByRole("textbox", { name: "Request title" }));
    await visible(canvas.getByRole("textbox", { name: "Description" }));
  },
};

export const RequiredValidation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByText("Title is required"));
    await expect(
      canvas.getByRole("textbox", { name: "Request title" }),
    ).toHaveFocus();
    await visible(
      canvas.getByRole("heading", { name: "New Request", level: 1 }),
    );
  },
};

export const LinkAndBack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reachLink(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Related link" }), "https://example.test/customer-feedback");
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Edit Request" }));
    await expect(canvas.getByRole("textbox", { name: "Request title" })).toHaveValue(requestSource.title);
    await expect(canvas.getByRole("textbox", { name: "Related link" })).toHaveValue("https://example.test/customer-feedback");
    await expect(runTriage).toHaveBeenCalledTimes(1);
  },
};


const legacySource = {
  ...requestSource,
  affectedPeople: "Customers returning to unfinished drafts",
  desiredChange: "Find the same draft when returning to the editor",
  observedEvidence: "A customer described losing their place after leaving the editor",
  uncertainty: "Whether the draft is missing or difficult to find",
  usefulLink: "https://example.test/customer-feedback",
};

export const LegacyDraft: Story = {
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId), { source: legacySource, review: null });
  },
};

export const LegacyDraftPreserved: Story = {
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId), { source: legacySource, review: null });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("textbox", { name: "Request title" })).toHaveValue(legacySource.title);
    await expect(canvas.getByRole("textbox", { name: "Related link" })).toHaveValue(legacySource.usefulLink);
    const earlierDetails = within(canvas.getByRole("region", { name: "Details from your earlier draft" }));
    for (const value of [legacySource.affectedPeople, legacySource.desiredChange, legacySource.observedEvidence, legacySource.uncertainty]) {
      await expect(earlierDetails.getByText(value)).toBeVisible();
    }
    await expect(earlierDetails.queryByRole("textbox")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review your Request" }));
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining(legacySource), context);
    await expect(within(canvas.getByRole("region", { name: "Details from your earlier draft" })).getByText(legacySource.observedEvidence)).toBeVisible();
    await expect(readIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))?.source).toMatchObject(legacySource);
    await userEvent.click(canvas.getByRole("button", { name: "Edit Request" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Description" }), " The customer returned the next day.");
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review your Request" }));
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({
      ...legacySource,
      description: `${legacySource.description} The customer returned the next day.`,
    }), context);
    await expect(readIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))?.source).toMatchObject({
      affectedPeople: legacySource.affectedPeople,
      desiredChange: legacySource.desiredChange,
      observedEvidence: legacySource.observedEvidence,
      uncertainty: legacySource.uncertainty,
    });
    await userEvent.click(canvas.getByRole("button", { name: "Create Request" }));
    await expect(saveRequest).toHaveBeenCalledWith({ token: "story-review-token", editedProblemText: null }, context);
    await expect(saveRequest).toHaveBeenCalledTimes(1);
  },
};


export const LegacyFieldValidation: Story = {
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId), { source: legacySource, review: null });
    mocked(runTriage).mockResolvedValueOnce({
      success: false,
      error: { code: "validation", field: "observedEvidence", message: "Please check the details from your earlier draft." },
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByText("Please check the details from your earlier draft."));
    await waitFor(() => expect(canvas.getByRole("region", { name: "Details from your earlier draft" })).toHaveFocus());
    await expect(canvas.getByRole("textbox", { name: "Description" })).toHaveValue(legacySource.description);
    await expect(saveRequest).not.toHaveBeenCalled();
    await waitForButtonLabelsToSettle(canvasElement);
  },
};

function restoreReview(triage: TriageResult) {
  writeIntakeDraft(
    window.sessionStorage,
    intakeDraftScope(draftOwnerId, context.orgId),
    {
      source: requestSource,
      review: {
        triage,
        token: "story-review-token",
        editedProblem: triage.reframedProblem ?? "",
      },
    },
  );
}

async function fillRequest(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.type(
    canvas.getByRole("textbox", { name: "Request title" }),
    requestSource.title,
  );
  await userEvent.type(
    canvas.getByRole("textbox", { name: "Description" }),
    requestSource.description,
  );
  await fillMetricImpact(canvas);
  return canvas;
}

async function reachLink(canvasElement: HTMLElement) {
  const canvas = await fillRequest(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "Add link" }));
  await canvas.findByRole("textbox", { name: "Related link" });
  return canvas;
}

async function reachCheck(canvasElement: HTMLElement) {
  const canvas = await fillRequest(canvasElement);
  await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
  return canvas;
}

export const RelatedLink: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reachLink(canvasElement);
    await visible(canvas.getByRole("textbox", { name: "Related link" }));
    await visible(
      canvas.getByRole("button", { name: "Attach files" }),
    );
  },
};

export const ReviewWithoutOptionalDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reachCheck(canvasElement);
    await visible(await canvas.findByRole("heading", { name: "Review your Request" }));
    await expect(
      canvas.getByRole("button", { name: "Create Request" }),
    ).toBeEnabled();
    await expect(runTriage).toHaveBeenCalledTimes(1);
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(canvas.queryByRole("list", { name: "Files ready to upload" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: /related link|files|supporting details/i })).not.toBeInTheDocument();
  },
};

async function reviewSupportingDetails(
  canvasElement: HTMLElement,
  triage: TriageResult,
  longContent = false,
) {
  const canvas = await reachLink(canvasElement);
  const relatedLink = longContent
    ? `https://example.test/research/${"saved-draft-findability-".repeat(12)}results?cohort=returning-customers`
    : "https://example.test/research/saved-draft-findability?cohort=returning-customers";
  const fileName = longContent
    ? `${"saved-draft-findability-".repeat(8)}customer-interviews.txt`
    : "saved-draft-customer-interviews.txt";
  await userEvent.type(canvas.getByRole("textbox", { name: "Related link" }), relatedLink);
  await userEvent.upload(
    canvas.getByLabelText("Choose Request files"),
    new File(["x".repeat(2048)], fileName, { type: "text/plain" }),
  );
  await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
  const reviewHeading = triage.classification === "problem" ? "Review your Request" : "Check the suggested problem";
  await visible(await canvas.findByRole("heading", { name: reviewHeading }));

  const assertReview = async () => {
    const link = await canvas.findByRole("link", { name: (name) => name.includes(relatedLink) });
    await expect(link).toHaveAttribute("href", relatedLink);
    await expect(link).toHaveTextContent(relatedLink);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
    const files = within(canvas.getByRole("list", { name: "Files ready to upload" }));
    const fileTitle = files.getByText(fileName);
    await expect(fileTitle).toBeVisible();
    await expect(link.scrollWidth).toBeLessThanOrEqual(link.clientWidth + 1);
    await expect(fileTitle.scrollWidth).toBeLessThanOrEqual(fileTitle.clientWidth + 1);
    await expect(files.getByText("2.0 KB")).toBeVisible();
    await expect(files.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    await expect(canvas.getByText(/files? (will )?upload.*creat/i)).toBeVisible();
    const impact = within(canvas.getByRole("region", { name: "Expected impact" }));
    await expect(impact.getByText("90 %")).toBeVisible();
    await expect(impact.getByText("14 days after launch")).toBeVisible();
    await expect(canvas.getByRole("heading", { name: requestSource.title })).toBeVisible();
    await expect(canvas.getByText(requestSource.description)).toBeVisible();
    if (triage.classification !== "problem") {
      await expect(canvas.getByRole("textbox", { name: "Problem to solve" })).toHaveValue(triage.reframedProblem);
    }
    if (triage.classification === "hybrid") {
      await expect(canvas.getByText(triage.extractedSolution!)).toBeVisible();
    }
    await expect(prepareAttachmentUpload).not.toHaveBeenCalled();
    await expect(finalizeAttachmentUpload).not.toHaveBeenCalled();
    await expect(saveRequest).not.toHaveBeenCalled();
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  };

  await assertReview();
  await userEvent.click(canvas.getByRole("button", { name: "Edit Request" }));
  await expect(canvas.getByRole("textbox", { name: "Related link" })).toHaveValue(relatedLink);
  await expect(canvas.getByRole("textbox", { name: "Request title" })).toHaveValue(requestSource.title);
  await expect(canvas.getByRole("textbox", { name: "Description" })).toHaveValue(requestSource.description);
  await expect(canvas.getByRole("spinbutton", { name: /^Target value/ })).toHaveValue(90);
  await expect(canvas.getByRole("spinbutton", { name: /^Current value/ })).toHaveValue(null);
  await expect(within(canvas.getByRole("list", { name: "Files ready to upload" })).getByText(fileName)).toBeVisible();
  await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
  await visible(await canvas.findByRole("heading", { name: reviewHeading }));
  await assertReview();
}

export const ProblemReviewSupportingDetails: Story = {
  play: async ({ canvasElement }) => reviewSupportingDetails(canvasElement, problem),
};

export const SolutionReviewSupportingDetails: Story = {
  beforeEach: () => {
    mocked(runTriage).mockResolvedValue({ success: true, triage: solution, token: "story-review-token" });
  },
  play: async ({ canvasElement }) => reviewSupportingDetails(canvasElement, solution),
};

export const HybridReviewSupportingDetails: Story = {
  beforeEach: () => {
    mocked(runTriage).mockResolvedValue({ success: true, triage: hybrid, token: "story-review-token" });
  },
  play: async ({ canvasElement }) => reviewSupportingDetails(canvasElement, hybrid, true),
};

export const ProblemReview: Story = {
  beforeEach: () => restoreReview(problem),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await visible(
      await canvas.findByRole("heading", {
        name: "Review your Request",
        level: 2,
      }),
    );
    await visible(canvas.getByRole("heading", { name: requestSource.title }));
    await visible(canvas.getByText(requestSource.description));
    await expect(
      canvas.getByRole("button", { name: "Create Request" }),
    ).toBeEnabled();
  },
};

export const SolutionReview: Story = {
  beforeEach: () => {
    mocked(runTriage).mockResolvedValue({ success: true, triage: solution, token: "story-review-token" });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Request title" }), "Add a saved-drafts tab");
    await userEvent.type(canvas.getByRole("textbox", { name: "Description" }), "Add a tab in the editor where customers can find their unfinished drafts.");
    await fillMetricImpact(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(
      await canvas.findByRole("heading", {
        name: "Check the suggested problem",
        level: 2,
      }),
    );
    await expect(
      canvas.getByRole("textbox", { name: "Problem to solve" }),
    ).toHaveValue(solution.reframedProblem);
    await visible(canvas.getByRole("heading", { name: "Your original Request" }));
  },
};

export const HybridReview: Story = {
  beforeEach: () => restoreReview(hybrid),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await visible(
      await canvas.findByRole("heading", {
        name: "Check the suggested problem",
        level: 2,
      }),
    );
    await expect(
      canvas.getByRole("textbox", { name: "Problem to solve" }),
    ).toHaveValue(hybrid.reframedProblem);
    await visible(canvas.getByText(hybrid.extractedSolution!));
    await expect(
      canvas
        .getByRole("button", { name: "Create Request" })
        .getBoundingClientRect().height,
    ).toBeGreaterThanOrEqual(32);
  },
};

export const InvalidFraming: Story = {
  beforeEach: () => restoreReview(solution),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox", {
      name: "Problem to solve",
    });
    await userEvent.clear(input);
    await userEvent.click(
      canvas.getByRole("button", { name: "Create Request" }),
    );
    await visible(
      await canvas.findByText("Describe the problem in at least 10 characters"),
    );
    await expect(input).toHaveFocus();
    await expect(saveRequest).not.toHaveBeenCalled();
  },
};

export const Checking: Story = {
  beforeEach: () => {
    mocked(runTriage).mockImplementation(() => new Promise(() => {}));
  },
  play: async ({ canvasElement }) => {
    const canvas = await reachCheck(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: "Preparing review…" }),
    ).toBeDisabled();
    await expect(canvas.getByRole("textbox", { name: "Request title" })).toHaveAttribute("readonly");
    await expect(canvas.getByRole("textbox", { name: "Description" })).toHaveAttribute("readonly");
  },
};

export const CheckFailed: Story = {
  beforeEach: () => {
    mocked(runTriage).mockRejectedValue(new Error("Offline fixture"));
  },
  play: async ({ canvasElement }) => {
    const canvas = await reachCheck(canvasElement);
    await visible(
      await canvas.findByText(
        "The review could not finish. Your draft is still here. Check your connection and try again.",
      ),
    );
    await expect(
      canvas.getByRole("button", { name: "Review Request" }),
    ).toBeEnabled();
    await expect(canvas.getByRole("textbox", { name: "Request title" })).toHaveValue(requestSource.title);
  },
};

export const SessionExpired: Story = {
  beforeEach: () => {
    mocked(runTriage).mockResolvedValue({
      success: false,
      error: {
        code: "session_expired",
        message: "Your session ended. Sign in again to continue this Request.",
      },
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = await reachCheck(canvasElement);
    await expect(
      await canvas.findByRole("link", { name: "Sign in again" }),
    ).toHaveAttribute("href", "/login#/?redirect_url=%2Fintake");
    await expect(canvas.getByRole("textbox", { name: "Description" })).toHaveValue(requestSource.description);
  },
};

export const Creating: Story = {
  beforeEach: () => {
    restoreReview(problem);
    mocked(saveRequest).mockImplementation(() => new Promise(() => {}));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Create Request" }),
    );
    await expect(
      await canvas.findByRole("button", { name: "Creating Request…" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Edit Request" }),
    ).toBeDisabled();
  },
};

export const CreatedRequestDoesNotBlockNavigation: Story = {
  args: { onCreated: fn() },
  decorators: [(Story) => <><a href="/settings/profile" onClick={(event) => event.preventDefault()}>Profile navigation fixture</a><Story /></>],
  beforeEach: () => restoreReview(problem),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Create Request" }));
    await waitFor(() => expect(args.onCreated).toHaveBeenCalledTimes(1));
    await userEvent.click(canvas.getByRole("link", { name: "Profile navigation fixture" }));
    await expect(within(document.body).queryByRole("dialog", { name: "Creating your Request" })).not.toBeInTheDocument();
  },
};

export const ReviewExpired: Story = {
  beforeEach: () => {
    restoreReview(solution);
    mocked(saveRequest).mockResolvedValue({
      success: false,
      error: {
        code: "review_expired",
        message:
          "This review has expired. Your original Request is still here. Review it again to continue.",
      },
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Create Request" }),
    );
    await visible(
      await canvas.findByRole("button", { name: "Review again" }),
    );
    await expect(
      canvas.getByRole("textbox", { name: "Problem to solve" }),
    ).toHaveValue(solution.reframedProblem);
    await waitForButtonLabelsToSettle(canvasElement);
  },
};

export const SaveFailed: Story = {
  beforeEach: () => {
    restoreReview(problem);
    mocked(saveRequest).mockRejectedValue(new Error("Offline fixture"));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Create Request" }),
    );
    await visible(
      await canvas.findByText(
        "Your Request could not be created. Your text is still here. Try again.",
      ),
    );
    await expect(
      canvas.getByRole("button", { name: "Create Request" }),
    ).toBeEnabled();
    await waitForButtonLabelsToSettle(canvasElement);
  },
};

export const QueuedAttachments: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await fillRequest(canvasElement);
    await userEvent.upload(
      canvas.getByLabelText("Choose Request files"),
      new File(["Evidence from a customer interview."], "interview-notes.txt", {
        type: "text/plain",
      }),
    );
    await visible(canvas.getByRole("list", { name: "Files ready to upload" }));
    await visible(canvas.getByText("interview-notes.txt"));
    await expect(prepareAttachmentUpload).not.toHaveBeenCalled();
  },
};

async function reachAttachmentSave(canvasElement: HTMLElement) {
  const canvas = await fillRequest(canvasElement);
  await userEvent.upload(
    canvas.getByLabelText("Choose Request files"),
    new File(["Evidence from a customer interview."], "interview-notes.txt", {
      type: "text/plain",
    }),
  );
  await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
  await userEvent.click(
    await canvas.findByRole("button", { name: "Create Request" }),
  );
  return canvas;
}

export const AttachmentRecovery: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reachAttachmentSave(canvasElement);
    await visible(
      await canvas.findByRole("heading", {
        name: "Some files weren’t uploaded",
        level: 2,
      }),
    );
    await visible(canvas.getByRole("button", { name: "Retry upload" }));
    await visible(canvas.getByRole("button", { name: "Skip failed files" }));
    await expect(saveRequest).toHaveBeenCalledTimes(1);
  },
};

export const Uploading: Story = {
  beforeEach: () => {
    mocked(prepareAttachmentUpload).mockImplementation(
      () => new Promise(() => {}),
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = await reachAttachmentSave(canvasElement);
    await visible(
      await canvas.findByRole("heading", { name: "Uploading files", level: 2 }),
    );
    await visible(
      canvas.getByRole("progressbar", {
        name: "Uploading interview-notes.txt",
      }),
    );
    const unload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(unload);
    await expect(unload.defaultPrevented).toBe(true);
  },
};

export const Loading: Story = {
  render: () => <IntakeLoading />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("status", { name: "Loading Intake" }),
    ).toHaveAttribute("aria-busy", "true");
  },
};

async function visible(element: HTMLElement | Promise<HTMLElement>) {
  const node = await element;
  await waitFor(() => expect(node).toBeVisible());
}

async function waitForButtonLabelsToSettle(canvasElement: HTMLElement) {
  await waitFor(() =>
    expect(canvasElement.querySelector('[data-motion-pop-id][aria-hidden="true"]')).toBeNull(),
  );
}

export const LinkToggle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reachLink(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Related link" });
    await userEvent.type(input, "https://example.test/customer-feedback");
    const toggle = canvas.getByRole("button", { name: "Add link" });
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("textbox", { name: "Related link" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByRole("textbox", { name: "Related link" })).toHaveValue("https://example.test/customer-feedback");
    await expect(canvas.getByRole("textbox", { name: "Request title" })).toHaveValue(requestSource.title);
  },
};

export const PendingUploadNavigation: Story = {
  decorators: [
    (Story) => (
      <>
        <a href="/settings/profile" onClick={(event) => event.preventDefault()}>
          Profile navigation fixture
        </a>
        <Story />
      </>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = await reachAttachmentSave(canvasElement);
    await visible(
      canvas.findByRole("heading", {
        name: "Some files weren’t uploaded",
        level: 2,
      }),
    );
    await userEvent.click(
      canvas.getByRole("link", { name: "Profile navigation fixture" }),
    );
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", {
      name: "Leave unfinished uploads?",
    });
    await visible(dialog);
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Keep working" }),
    );
    await waitFor(() =>
      expect(page.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await visible(canvas.getByRole("button", { name: "Retry upload" }));
    await expect(
      canvas.getByRole("link", { name: "Profile navigation fixture" }),
    ).toHaveFocus();
    await userEvent.click(canvas.getByRole("button", { name: "Retry upload" }));
    await expect(saveRequest).toHaveBeenCalledTimes(1);
    await visible(canvas.getByRole("button", { name: "Retry upload" }));
  },
};

export const CreationNavigation: Story = {
  decorators: [
    (Story) => (
      <>
        <a href="/settings/profile" onClick={(event) => event.preventDefault()}>
          Profile navigation fixture
        </a>
        <Story />
      </>
    ),
  ],
  beforeEach: () => {
    restoreReview(problem);
    mocked(saveRequest).mockImplementation(() => new Promise(() => {}));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Create Request" }),
    );
    await userEvent.click(
      canvas.getByRole("link", { name: "Profile navigation fixture" }),
    );
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", {
      name: "Creating your Request",
    });
    await visible(dialog);
    await expect(
      within(dialog).queryByRole("button", { name: "Leave page" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Keep working" }),
    );
    await waitFor(() =>
      expect(page.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    await expect(
      canvas.getByRole("button", { name: "Creating Request…" }),
    ).toBeDisabled();
  },
};

export const LeaveUploadRecovery: Story = {
  decorators: [
    (Story) => (
      <>
        <a href="/settings/profile" onClick={(event) => event.preventDefault()}>
          Profile navigation fixture
        </a>
        <Story />
      </>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = await reachAttachmentSave(canvasElement);
    await visible(
      canvas.findByRole("heading", {
        name: "Some files weren’t uploaded",
        level: 2,
      }),
    );
    await userEvent.click(
      canvas.getByRole("link", { name: "Profile navigation fixture" }),
    );
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", {
      name: "Leave unfinished uploads?",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Leave page" }),
    );
    await waitFor(() =>
      expect(getRouter().push).toHaveBeenCalledWith("/settings/profile"),
    );
    await expect(saveRequest).toHaveBeenCalledTimes(1);
  },
};

export const WorkspaceIntake: Story = {
  parameters: { workspaceShell: true },
  render: (args) => (
    <SidebarView
      notifications={null}
      workspaceName="Lane Studio"
      fullName="Nikhil Sharma"
      email="nikhil@example.test"
      role="member"
      pathname="/intake"
      statusFilter="all"
      onSignOut={() => {}}
    >
      <IntakeForm {...args} />
    </SidebarView>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await visible(
      canvas.getByRole("heading", { name: "New Request", level: 1 }),
    );
    await expect(
      canvasElement.ownerDocument.documentElement.scrollWidth,
    ).toBeLessThanOrEqual(window.innerWidth + 1);
  },
};

export const OptionalFieldValidation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reachLink(canvasElement);
    const usefulLink = canvas.getByRole("textbox", { name: "Related link" });
    await userEvent.type(usefulLink, "http://example.test/evidence");
    await userEvent.click(canvas.getByRole("button", { name: "Add link" }));
    await expect(canvas.queryByRole("textbox", { name: "Related link" })).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Review Request" }),
    );
    await visible(
      canvas.findByText("Enter a complete link, including https://"),
    );
    await expect(usefulLink).toHaveAttribute(
      "aria-describedby",
      "intake-useful-link-error",
    );
    await expect(usefulLink).toHaveFocus();
  },
};

export const ServerLinkValidation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await fillRequest(canvasElement);
    mocked(runTriage).mockResolvedValueOnce({
      success: false,
      error: { code: "validation", field: "usefulLink", message: "Please check the related link." },
    });
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    const input = await canvas.findByRole("textbox", { name: "Related link" });
    await expect(input).toHaveAttribute("aria-describedby", "intake-useful-link-error");
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.type(input, "https://example.test/customer-feedback");
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review your Request" }));
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ usefulLink: "https://example.test/customer-feedback" }), context);
  },
};

export const AllFailedFilesRemoved: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reachAttachmentSave(canvasElement);
    await visible(canvas.findByRole("heading", { name: "Some files weren’t uploaded", level: 2 }));
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
    await visible(canvas.findByRole("button", { name: "View Request" }));
    await expect(canvas.queryByRole("button", { name: "Retry failed files" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "View Request" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/requests/00000000-0000-4000-8000-000000000123"));
    await expect(saveRequest).toHaveBeenCalledTimes(1);
  },
};

export const ExpectedImpactRequired: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Request title" }), requestSource.title);
    await userEvent.type(canvas.getByRole("textbox", { name: "Description" }), requestSource.description);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(canvas.getByRole("textbox", { name: /^Metric/ })).toHaveFocus());
    await expect(runTriage).not.toHaveBeenCalled();
    await fillMetricImpact(canvas);
    const target = canvas.getByRole("spinbutton", { name: /^Target value/ });
    await userEvent.clear(target);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await waitFor(() => expect(target).toHaveFocus());
    await expect(target).toHaveAttribute("aria-invalid", "true");
    await expect(runTriage).not.toHaveBeenCalled();
  },
};

export const ExpectedMetricImpactReview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reachCheck(canvasElement);
    await visible(await canvas.findByRole("heading", { name: "Review your Request" }));
    const impact = within(canvas.getByRole("region", { name: "Expected impact" }));
    await expect(impact.getByText("Not measured yet")).toBeVisible();
    await expect(impact.getByText("90 %")).toBeVisible();
    await expect(impact.getByText("14 days after launch")).toBeVisible();
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: metricImpact }), context);
    await expect(readIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))?.source.expectedImpact).toEqual(metricImpact);
    await userEvent.click(canvas.getByRole("button", { name: "Edit Request" }));
    await expect(canvas.getByRole("spinbutton", { name: /^Current value/ })).toHaveValue(null);
    await expect(canvas.getByRole("spinbutton", { name: /^Target value/ })).toHaveValue(90);
    await expect(canvas.getByRole("textbox", { name: /^Data source/ })).toHaveValue(metricImpact.source);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Create Request" }));
    await expect(saveRequest).toHaveBeenCalledWith({ token: "story-review-token", editedProblemText: null }, context);
  },
};

export const ExpectedVerifiedImpactReview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Request title" }), requestSource.title);
    await userEvent.type(canvas.getByRole("textbox", { name: "Description" }), requestSource.description);
    await userEvent.click(canvas.getByRole("radio", { name: "Verified result" }));
    await userEvent.type(canvas.getByRole("textbox", { name: /^Success criterion/ }), verifiedImpact.result);
    await userEvent.type(canvas.getByRole("textbox", { name: /^Data source/ }), verifiedImpact.source);
    await userEvent.type(canvas.getByRole("spinbutton", { name: /^Measure after launch/ }), String(verifiedImpact.reviewAfterDays));
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review your Request" }));
    const impact = within(canvas.getByRole("region", { name: "Expected impact" }));
    await expect(impact.getByText(verifiedImpact.result)).toBeVisible();
    await expect(impact.getByText("1 day after launch")).toBeVisible();
    await expect(impact.queryByText("Current value")).not.toBeInTheDocument();
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: verifiedImpact }), context);
    await expect(readIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))?.source.expectedImpact).toEqual(verifiedImpact);
    await userEvent.click(canvas.getByRole("button", { name: "Create Request" }));
    await expect(saveRequest).toHaveBeenCalledWith({ token: "story-review-token", editedProblemText: null }, context);
  },
};

export const LegacyReviewNeedsImpact: Story = {
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId), {
      source: { ...legacySource, expectedImpact: null },
      review: { triage: solution, token: "old-token-without-impact", editedProblem: "Returning customers cannot identify which saved draft contains their latest changes." },
    });
    mocked(runTriage).mockResolvedValue({ success: true, triage: solution, token: "story-review-token" });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("textbox", { name: "Request title" })).toHaveValue(legacySource.title);
    await expect(canvas.getByRole("textbox", { name: "Description" })).toHaveValue(legacySource.description);
    await expect(canvas.getByRole("textbox", { name: "Related link" })).toHaveValue(legacySource.usefulLink);
    const earlierProblem = within(canvas.getByRole("region", { name: "Problem from your earlier review" }));
    await expect(earlierProblem.getByText("Returning customers cannot identify which saved draft contains their latest changes.")).toBeVisible();
    await expect(earlierProblem.queryByRole("textbox")).not.toBeInTheDocument();
    await expect(readIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))?.previousProblem).toBe("Returning customers cannot identify which saved draft contains their latest changes.");
    await expect(canvas.queryByRole("button", { name: "Create Request" })).not.toBeInTheDocument();
    await expect(runTriage).not.toHaveBeenCalled();
    await fillMetricImpact(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Check the suggested problem" }));
    await expect(canvas.getByRole("textbox", { name: "Problem to solve" })).toHaveValue("Returning customers cannot identify which saved draft contains their latest changes.");
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining(legacySource), context);
    await userEvent.click(canvas.getByRole("button", { name: "Create Request" }));
    await expect(saveRequest).toHaveBeenCalledWith({ token: "story-review-token", editedProblemText: "Returning customers cannot identify which saved draft contains their latest changes." }, context);
  },
};

export const ExpectedImpactModeSwitch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await fillRequest(canvasElement);
    const changeMode = async (name: string) => {
      await userEvent.click(canvas.getByRole("radio", { name }));
      await expect(canvas.getByRole("radio", { name })).toBeChecked();
    };
    await userEvent.type(canvas.getByRole("spinbutton", { name: /^Current value/ }), "35");
    await changeMode("Verified result");
    await expect(canvas.getByRole("textbox", { name: /^Data source/ })).toHaveValue(metricImpact.source);
    await expect(canvas.getByRole("spinbutton", { name: /^Measure after launch/ })).toHaveValue(14);
    await userEvent.type(canvas.getByRole("textbox", { name: /^Success criterion/ }), verifiedImpact.result);
    await userEvent.clear(canvas.getByRole("textbox", { name: /^Data source/ }));
    await userEvent.type(canvas.getByRole("textbox", { name: /^Data source/ }), "Shared browser check");
    await userEvent.clear(canvas.getByRole("spinbutton", { name: /^Measure after launch/ }));
    await userEvent.type(canvas.getByRole("spinbutton", { name: /^Measure after launch/ }), "7");
    await changeMode("Metric");
    await expect(canvas.getByRole("textbox", { name: /^Metric/ })).toHaveValue(metricImpact.metric);
    await expect(canvas.getByRole("spinbutton", { name: /^Current value/ })).toHaveValue(35);
    await expect(canvas.getByRole("spinbutton", { name: /^Target value/ })).toHaveValue(90);
    await expect(canvas.getByRole("textbox", { name: /^Unit/ })).toHaveValue("%");
    await expect(canvas.getByRole("textbox", { name: /^Data source/ })).toHaveValue("Shared browser check");
    await expect(canvas.getByRole("spinbutton", { name: /^Measure after launch/ })).toHaveValue(7);
    await changeMode("Verified result");
    await expect(canvas.getByRole("textbox", { name: /^Success criterion/ })).toHaveValue(verifiedImpact.result);
    await expect(canvas.getByRole("textbox", { name: /^Data source/ })).toHaveValue("Shared browser check");
    await expect(canvas.getByRole("spinbutton", { name: /^Measure after launch/ })).toHaveValue(7);
  },
};
