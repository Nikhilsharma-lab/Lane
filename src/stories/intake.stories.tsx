import { listProjects, createProject } from "@/app/(app)/intake/project-actions";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { PageStrip } from "@/components/shell/page-strip";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState, type ComponentProps } from "react";
import { clearUnfinishedUploads, readLostUploads, readUnfinishedUploads } from "@/lib/unfinished-uploads";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";

import { IntakeLauncher } from "@/components/requests/intake-launcher";
import { NewRequestProvider } from "@/components/requests/new-request-provider";
import IntakeForm from "@/app/(app)/intake/intake-form";
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import { PendingMutationsProvider, usePendingMutations } from "@/components/requests/pending-mutations-provider";
import type { OverviewRequest } from "@/lib/request-overview";
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
import { fillMetricImpact, metricImpact, openImpact, verifiedImpact } from "./fixtures/request-impact";
import requestsMeta, { RequestsShellFixture } from "./requests.stories";

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
    // A story that leaves uploads unfinished leaves this tab's record (plan item 2.3, S3).
    clearUnfinishedUploads(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId));
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
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    await expect(runTriage).toHaveBeenCalledTimes(1);
    await expect(saveRequest).not.toHaveBeenCalled();
    await expect(canvas.getByRole("button", { name: "Create Request" })).toBeEnabled();
  },
};

export const Compose: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The page strip is the h1 (plan item 2.3); the form has no heading of its own.
    await expect(canvas.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
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
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining(legacySource), context);
    await expect(within(canvas.getByRole("region", { name: "Details from your earlier draft" })).getByText(legacySource.observedEvidence)).toBeVisible();
    await expect(readIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))?.source).toMatchObject(legacySource);
    await userEvent.click(canvas.getByRole("button", { name: "Edit Request" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Description" }), " The customer returned the next day.");
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
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
    await waitForCreatedNotification(canvasElement);
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
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
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
  const reviewHeading = "Review Request";
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
    await expect(impact.getByText("14 days")).toBeVisible();
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
  await expect(canvas.getByRole("spinbutton", { name: "Goal" })).toHaveValue(90);
  await expect(canvas.queryByRole("spinbutton", { name: "Today (optional)" })).not.toBeInTheDocument();
  await expect(canvas.getByRole("button", { name: "Add current value" })).toBeVisible();
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
        name: "Review Request",
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
        name: "Review Request",
        level: 2,
      }),
    );
    await expect(
      canvas.getByRole("textbox", { name: "Problem to solve" }),
    ).toHaveValue(solution.reframedProblem);
    // The AI attribution line follows the one review heading (plan item 2.3).
    await visible(canvas.getByText(/^Lane’s AI suggested a problem to solve from your description\./));
    await visible(canvas.getByRole("heading", { name: "Your original Request" }));
  },
};

export const HybridReview: Story = {
  beforeEach: () => restoreReview(hybrid),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await visible(
      await canvas.findByRole("heading", {
        name: "Review Request",
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
    // Plan item 2.3: the review step's shape with a visible status, at once.
    const status = await canvas.findByText("Checking whether this describes a problem…");
    await visible(status);
    await expect(status).toHaveAttribute("role", "status");
    await expect(canvas.getByRole("heading", { name: "Review Request", level: 2 })).toHaveFocus();
    await expect(
      canvas.getByRole("button", { name: "Review Request" }),
    ).toHaveAttribute("aria-busy", "true");
    // The compose form stays mounted, hidden, with its values.
    await expect(canvas.queryByRole("textbox", { name: "Request title" })).not.toBeInTheDocument();
    await expect(canvasElement.querySelector<HTMLInputElement>("#intake-title")?.value).toBe(requestSource.title);
  },
};

export const CheckFailed: Story = {
  beforeEach: () => {
    mocked(runTriage).mockRejectedValue(new Error("Offline fixture"));
  },
  play: async ({ canvasElement }) => {
    const canvas = await reachCheck(canvasElement);
    await visible(await canvas.findByText("Review unavailable right now"));
    await visible(canvas.getByText("Your draft is kept."));
    const review = canvas.getByRole("button", { name: "Review Request" });
    await expect(review).toBeEnabled();
    await waitFor(() => expect(review).toHaveFocus());
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
    await visible(canvas.getByText("Your session ended"));
    // One silent retry with a fresh token came first.
    await expect(runTriage).toHaveBeenCalledTimes(2);
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
    ).toHaveAttribute("aria-disabled", "true");
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

export const AttachmentRemovalFocus: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(canvas.getByLabelText("Choose Request files"), [
      new File(["First"], "first.txt", { type: "text/plain" }),
      new File(["Second"], "second.txt", { type: "text/plain" }),
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "Remove first.txt" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Remove second.txt" })).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(canvas.getByRole("button", { name: "Attach files" })).toHaveFocus());
    await expect(canvas.queryByRole("list", { name: "Files ready to upload" })).not.toBeInTheDocument();
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
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("status", { name: "Loading New Request" }),
    ).toHaveAttribute("aria-busy", "true");
    // The launcher's frame (2026-10-13): the strip's h1, then the centred state's shape.
    await expect(canvas.getByRole("heading", { name: "New Request", level: 1 })).toBeVisible();
    await expect(canvas.getAllByRole("status")).toHaveLength(1);
    await expect(canvasElement.querySelector('[data-skeleton="intake"]')).toHaveAttribute("aria-busy", "true");
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

async function waitForCreatedNotification(canvasElement: HTMLElement) {
  const page = within(canvasElement.ownerDocument.body);
  const notification = (await page.findByRole("button", { name: "Dismiss notification" })).closest("li")!;
  // MotionValue fades do not appear in document.getAnimations(). Wait for the
  // notification to be opaque before Storybook measures its text contrast.
  await waitFor(() => {
    expect(within(notification).getByText("Request created")).toBeVisible();
    expect(getComputedStyle(notification).opacity).toBe("1");
  });
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
    ).toHaveAttribute("aria-disabled", "true");
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
    // Leaving ends the uploads in this document, so no later reload reports them (plan item 2.3, S3).
    await waitFor(() =>
      expect(readUnfinishedUploads(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))).toBeNull(),
    );
  },
};

let failFirstUpload: () => void = () => {};

export const LeaveWhileUploadingStopsTheRest: Story = {
  decorators: LeaveUploadRecovery.decorators,
  beforeEach: () => {
    // The first file is still being prepared when the person leaves.
    mocked(prepareAttachmentUpload).mockImplementationOnce(
      () => new Promise((resolve) => {
        failFirstUpload = () => resolve({ success: false, error: { code: "storage_unavailable", message: "Lane could not start this upload. The Request is safe. Try the file again." } });
      }),
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = await fillRequest(canvasElement);
    await userEvent.upload(canvas.getByLabelText("Choose Request files"), [
      new File(["Evidence from a customer interview."], "interview-notes.txt", { type: "text/plain" }),
      new File(["Notes from support."], "support-notes.md", { type: "text/markdown" }),
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Create Request" }));
    await visible(canvas.findByRole("heading", { name: "Uploading files", level: 2 }));
    const scope = intakeDraftScope(draftOwnerId, context.orgId);
    await waitFor(() => expect(readUnfinishedUploads(window.sessionStorage, scope)?.files).toHaveLength(2));
    await userEvent.click(canvas.getByRole("link", { name: "Profile navigation fixture" }));
    const page = within(canvasElement.ownerDocument.body);
    const dialog = await page.findByRole("dialog", { name: "Leave unfinished uploads?" });
    // Only this explicit choice stops the uploads, and the dialog says what it costs.
    // Back or an unmount lets them finish (attachment-recovery.test.ts).
    await expect(dialog).toHaveAccessibleDescription("Your Request is saved. Files not yet uploaded won’t be added if you leave this page.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Leave page" }));
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/settings/profile"));
    // The file in flight ends; the next one never starts, and the record goes.
    failFirstUpload();
    await waitFor(() => expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(prepareAttachmentUpload).toHaveBeenCalledTimes(1);
    await expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull();
  },
};

// The composer's host unmounting (the layout leaves, or a workspace switch
// re-keys it) unmounts the composer. That is not a choice to drop files: the
// uploads go on without it (plan item 2.3, S3). This fixture stands in for it.
function UnmountableIntake(props: ComponentProps<typeof IntakeForm>) {
  const [mounted, setMounted] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setMounted(false)}>Back navigation fixture</button>
      {mounted && <IntakeForm {...props} />}
    </>
  );
}

let finishFirstPrepare: () => void = () => {};

/** The first file stays in preparation until the story lets it fail. */
function holdFirstPrepare() {
  mocked(prepareAttachmentUpload).mockImplementationOnce(
    () => new Promise((resolve) => {
      finishFirstPrepare = () => resolve({ success: false, error: { code: "storage_unavailable", message: "Lane could not start this upload. The Request is safe. Try the file again." } });
    }),
  );
}

export const BackWhileUploadingFinishesTheRest: Story = {
  render: (args) => <UnmountableIntake {...args} />,
  beforeEach: holdFirstPrepare,
  play: async ({ canvasElement }) => {
    const canvas = await fillRequest(canvasElement);
    await userEvent.upload(canvas.getByLabelText("Choose Request files"), [
      new File(["Evidence from a customer interview."], "interview-notes.txt", { type: "text/plain" }),
      new File(["Notes from support."], "support-notes.md", { type: "text/markdown" }),
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Create Request" }));
    await visible(canvas.findByRole("heading", { name: "Uploading files", level: 2 }));
    const scope = intakeDraftScope(draftOwnerId, context.orgId);
    await waitFor(() => expect(readUnfinishedUploads(window.sessionStorage, scope)?.files).toHaveLength(2));
    await userEvent.click(canvas.getByRole("button", { name: "Back navigation fixture" }));
    await waitFor(() => expect(canvas.queryByRole("heading", { name: "Uploading files" })).not.toBeInTheDocument());
    // Still owed: a reload now would name both files.
    await expect(readUnfinishedUploads(window.sessionStorage, scope)?.files).toHaveLength(2);
    finishFirstPrepare();
    // The next file still starts, and the record goes once the loop ends.
    await waitFor(() => expect(prepareAttachmentUpload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull());
    await expect(getRouter().push).not.toHaveBeenCalled();
  },
};

// Back while the save is pending: the Request is still created and joins the
// list through the overlay, but the composer that was left neither toasts nor
// navigates, and its files still upload, recorded from the first one.
const createdRow: OverviewRequest = { id: "00000000-0000-4000-8000-000000000123", requestNumber: 3, title: requestSource.title, reframedProblem: null, status: "open", createdAt: "2026-10-11T09:00:00.000Z", creatorName: null, assigneeName: null, assignedTo: null, projectId: null, projectName: null, requestType: null, priority: "none" };

/** The rows the overlay adds to the list, as the Requests list would show them. */
function ListedRequestsFixture() {
  const rows = usePendingMutations()?.apply<OverviewRequest>([]) ?? [];
  return <ul aria-label="Listed Requests fixture">{rows.map((row) => <li key={row.id}>{row.title}</li>)}</ul>;
}

let finishSave: () => void = () => {};

function holdSave() {
  mocked(saveRequest).mockImplementationOnce(() => new Promise((resolve) => {
    finishSave = () => resolve({ success: true, requestId: createdRow.id, created: createdRow });
  }));
}

async function backWhileSaving(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("button", { name: "Create Request" }));
  await canvas.findByRole("button", { name: "Creating Request…" });
  await userEvent.click(canvas.getByRole("button", { name: "Back navigation fixture" }));
  await waitFor(() => expect(canvas.queryByRole("button", { name: "Creating Request…" })).not.toBeInTheDocument());
  finishSave();
  const listed = canvas.getByRole("list", { name: "Listed Requests fixture" });
  await waitFor(() => expect(within(listed).getByText(requestSource.title)).toBeInTheDocument());
}

async function expectStayedWhereBackWent(canvasElement: HTMLElement) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  await expect(getRouter().push).not.toHaveBeenCalled();
  await expect(within(canvasElement.ownerDocument.body).queryByText("Request created")).not.toBeInTheDocument();
}

export const BackWhileSavingStaysWhereBackWent: Story = {
  render: (args) => <PendingMutationsProvider><UnmountableIntake {...args} /><ListedRequestsFixture /></PendingMutationsProvider>,
  beforeEach: () => {
    restoreReview(problem);
    holdSave();
  },
  play: async ({ canvasElement }) => {
    await backWhileSaving(canvasElement);
    await expectStayedWhereBackWent(canvasElement);
    await expect(readIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))).toBeNull();
  },
};

export const BackWhileSavingWithFilesKeepsTheRecord: Story = {
  render: BackWhileSavingStaysWhereBackWent.render,
  beforeEach: () => {
    holdSave();
    holdFirstPrepare();
  },
  play: async ({ canvasElement }) => {
    const canvas = await fillRequest(canvasElement);
    await userEvent.upload(canvas.getByLabelText("Choose Request files"), [
      new File(["Evidence from a customer interview."], "interview-notes.txt", { type: "text/plain" }),
      new File(["Notes from support."], "support-notes.md", { type: "text/markdown" }),
    ]);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await backWhileSaving(canvasElement);
    // The upload screen never rendered, yet the first upload starts with both
    // files recorded: a reload now would name them. This document's own record
    // is not a reload's.
    const scope = intakeDraftScope(draftOwnerId, context.orgId);
    await waitFor(() => expect(prepareAttachmentUpload).toHaveBeenCalledTimes(1));
    await expect(readUnfinishedUploads(window.sessionStorage, scope)?.files.map((file) => file.name)).toEqual(["interview-notes.txt", "support-notes.md"]);
    await expect(readLostUploads(window.sessionStorage, scope)).toBeNull();
    finishFirstPrepare();
    // The next file still starts, and the record goes once the loop ends.
    await waitFor(() => expect(prepareAttachmentUpload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(readUnfinishedUploads(window.sessionStorage, scope)).toBeNull());
    await expectStayedWhereBackWent(canvasElement);
  },
};

export const WorkspaceIntake: Story = {
  parameters: { workspaceShell: true },
  render: (args) => (
    <NewRequestProvider context={args.context} draftOwnerId={args.draftOwnerId}>
    <RequestsShellFixture
      {...requestsMeta.args}
      linearPreviewAutoCollapse
      pathname="/intake"
    >
      {/* As intake/page.tsx renders it (plan item 2.0; the composer is a centred dialog, 2026-10-13). */}
      <PageStrip title="New Request" heading />
      <IntakeLauncher />
    </RequestsShellFixture>
    </NewRequestProvider>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await visible(canvas.getByRole("heading", { name: "Start a new Request" }));
    // The strip is the page's one h1 and names it "New Request" (decision 8.10).
    await expect(canvas.getByRole("heading", { name: "New Request", level: 1 })).toBeVisible();
    await expect(canvas.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    await expect(canvas.queryByRole("heading", { name: "Intake" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Create Request" })).toHaveAttribute("aria-haspopup", "dialog");
    await expect(within(canvasElement.ownerDocument.body).queryByRole("dialog", { name: "New Request" })).not.toBeInTheDocument();
    const strip = canvasElement.querySelector<HTMLElement>('[data-slot="page-strip"]')!;
    await expect(strip.querySelector('li[aria-current="page"]')).toHaveTextContent("New Request");
    // Phones keep the parent crumb too, so Requests is one tap away at every width.
    const crumbs = within(strip).getByRole("navigation", { name: "Breadcrumb" });
    await expect([...crumbs.querySelectorAll("li")].map((item) => item.textContent).at(-1)).toBe("New Request");
    await expect(crumbs.querySelectorAll("li").length).toBeGreaterThanOrEqual(2);
    await expect(canvasElement.ownerDocument.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
};

export const WorkspaceActionsRemainVisible: Story = {
  ...WorkspaceIntake,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("link", { name: "Create Request" }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", { name: "New Request" });
    const canvas = within(dialog);
    await userEvent.type(await canvas.findByRole("textbox", { name: "Request title" }), requestSource.title);
    const description = canvas.getByRole("textbox", { name: "Description" });
    await userEvent.type(description, requestSource.description);
    // #45's compact Expected impact fits a short draft in a 390 × 1000 dialog, so the
    // description carries interview notes: a long Request must scroll on a phone.
    await userEvent.paste(Array.from({ length: 4 }, (_, index) => `\n\nInterview ${index + 1}: customers reopen several drafts before they find their latest changes.`).join(""));
    await fillMetricImpact(canvas);
    await userEvent.click(canvas.getByRole("button", { name: "Add link" }));
    const relatedLink = canvas.getByRole("textbox", { name: "Related link" });
    await userEvent.type(relatedLink, "https://example.test/customer-feedback");
    await userEvent.upload(canvas.getByLabelText("Choose Request files"), [
      new File(["evidence"], "Customer-feedback.pdf", { type: "application/pdf" }),
      new File(["image"], "Long-customer-interview-screenshot.png", { type: "image/png" }),
    ]);
    const review = canvas.getByRole("button", { name: "Review Request" });
    const footer = review.closest("footer")!;
    let scroller: HTMLElement | null = relatedLink.parentElement;
    while (scroller && !(/auto|scroll/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) scroller = scroller.parentElement;
    // Narrow viewports must scroll; wider ones can fit the complete form.
    if (window.innerWidth <= 640) await expect(scroller).not.toBeNull();
    if (scroller) {
      for (const position of [0, scroller.scrollHeight / 2, scroller.scrollHeight]) {
        scroller.scrollTop = position;
        scroller.dispatchEvent(new Event("scroll"));
        await waitFor(() => {
          const bounds = review.getBoundingClientRect();
          expect(bounds.top).toBeGreaterThanOrEqual(0);
          expect(bounds.bottom).toBeLessThanOrEqual(window.innerHeight);
        });
      }
      scroller.scrollTop = 0;
      relatedLink.focus();
      await waitFor(() => {
        expect(relatedLink).toHaveFocus();
        expect(relatedLink.getBoundingClientRect().top).toBeGreaterThanOrEqual(scroller!.getBoundingClientRect().top);
        expect(relatedLink.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.getBoundingClientRect().top);
      });
    }
    await userEvent.click(review);
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    await expect(runTriage).toHaveBeenCalledTimes(1);
    await expect(saveRequest).not.toHaveBeenCalled();
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
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ usefulLink: "https://example.test/customer-feedback" }), context);
  },
};

export const AllFailedFilesRemoved: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await reachAttachmentSave(canvasElement);
    await visible(canvas.findByRole("heading", { name: "Some files weren’t uploaded", level: 2 }));
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
    await visible(canvas.findByRole("button", { name: "Open Request" }));
    await expect(canvas.queryByRole("button", { name: "Retry failed files" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Open Request" }));
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
    await waitFor(() => expect(canvas.getByRole("textbox", { name: "What should improve?" })).toHaveFocus());
    await expect(runTriage).not.toHaveBeenCalled();
    await fillMetricImpact(canvas);
    const target = canvas.getByRole("spinbutton", { name: "Goal" });
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
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    const impact = within(canvas.getByRole("region", { name: "Expected impact" }));
    await expect(impact.getByText("Not measured yet")).toBeVisible();
    await expect(impact.getByText("90 %")).toBeVisible();
    await expect(impact.getByText("14 days")).toBeVisible();
    await expect(impact.queryByText("Data source")).not.toBeInTheDocument();
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: metricImpact }), context);
    await expect(readIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))?.source.expectedImpact).toEqual(metricImpact);
    await userEvent.click(canvas.getByRole("button", { name: "Edit Request" }));
    await expect(canvas.queryByRole("spinbutton", { name: "Today (optional)" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Add current value" })).toBeVisible();
    await expect(canvas.getByRole("spinbutton", { name: "Goal" })).toHaveValue(90);
    await expect(canvas.queryByRole("textbox", { name: "Where will you check this?" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Create Request" }));
    await expect(saveRequest).toHaveBeenCalledWith({ token: "story-review-token", editedProblemText: null }, context);
    await waitForCreatedNotification(canvasElement);
  },
};

export const ExpectedVerifiedImpactReview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Request title" }), requestSource.title);
    await userEvent.type(canvas.getByRole("textbox", { name: "Description" }), requestSource.description);
    await openImpact(canvas);
    await userEvent.click(canvas.getByRole("combobox", { name: "Measure with: Metric" }));
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("option", { name: "Verified result" }));
    await waitFor(() => expect(canvas.getByRole("combobox", { name: "Measure with: Verified result" })).toHaveFocus());
    await userEvent.type(canvas.getByRole("textbox", { name: "What should be true when this is done?" }), verifiedImpact.result);
    await expect(canvas.queryByRole("textbox", { name: "Where will you check this?" })).not.toBeInTheDocument();
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Check in days" }), String(verifiedImpact.reviewAfterDays));
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    const impact = within(canvas.getByRole("region", { name: "Expected impact" }));
    await expect(impact.getByText(verifiedImpact.result)).toBeVisible();
    await expect(impact.getByText("1 day")).toBeVisible();
    await expect(impact.queryByText("Data source")).not.toBeInTheDocument();
    await expect(impact.queryByText("Current value")).not.toBeInTheDocument();
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: verifiedImpact }), context);
    await expect(readIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))?.source.expectedImpact).toEqual(verifiedImpact);
    await userEvent.click(canvas.getByRole("button", { name: "Create Request" }));
    await expect(saveRequest).toHaveBeenCalledWith({ token: "story-review-token", editedProblemText: null }, context);
    await waitForCreatedNotification(canvasElement);
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
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    await expect(canvas.getByRole("textbox", { name: "Problem to solve" })).toHaveValue("Returning customers cannot identify which saved draft contains their latest changes.");
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining(legacySource), context);
    await userEvent.click(canvas.getByRole("button", { name: "Create Request" }));
    await expect(saveRequest).toHaveBeenCalledWith({ token: "story-review-token", editedProblemText: "Returning customers cannot identify which saved draft contains their latest changes." }, context);
  },
};

export const ExpectedImpactRestoredZeroBaseline: Story = {
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId), {
      source: { ...requestSource, expectedImpact: { ...metricImpact, baseline: 0, source: "Saved-draft usability check" } },
      review: null,
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Folded, the complete impact reads as its summary: the restored source keeps its line, with no dangling comma.
    const impactRow = within(await canvas.findByRole("region", { name: "Expected impact" }));
    await expect(impactRow.getByText("Customers finding a saved draft, 0% to 90%")).toBeVisible();
    await expect(impactRow.getByText("Saved-draft usability check, 14 days after launch")).toBeVisible();
    await openImpact(canvas);
    await expect(await canvas.findByRole("spinbutton", { name: "Today (optional)" })).toHaveValue(0);
    await expect(canvas.queryByRole("button", { name: "Add current value" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("textbox", { name: "Where will you check this?" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: { ...metricImpact, baseline: 0, source: "Saved-draft usability check" } }), context);
    await expect(within(canvas.getByRole("region", { name: "Expected impact" })).getByText("Saved-draft usability check")).toBeVisible();
  },
};

export const ExpectedImpactModeSwitch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await fillRequest(canvasElement);
    const changeMode = async (name: string) => {
      await userEvent.click(canvas.getByRole("combobox", { name: /^Measure with:/ }));
      await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("option", { name }));
      await waitFor(() => expect(canvas.getByRole("combobox", { name: `Measure with: ${name}` })).toHaveFocus());
    };
    await expect(canvas.queryByRole("spinbutton", { name: "Today (optional)" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Add current value" }));
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Today (optional)" }), "35");
    await changeMode("Verified result");
    await expect(canvas.queryByRole("textbox", { name: "Where will you check this?" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("spinbutton", { name: "Check in days" })).toHaveValue(14);
    await userEvent.type(canvas.getByRole("textbox", { name: "What should be true when this is done?" }), verifiedImpact.result);
    await userEvent.clear(canvas.getByRole("spinbutton", { name: "Check in days" }));
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Check in days" }), "7");
    await changeMode("Metric");
    await expect(canvas.getByRole("textbox", { name: "What should improve?" })).toHaveValue(metricImpact.metric);
    await expect(canvas.getByRole("spinbutton", { name: "Today (optional)" })).toHaveValue(35);
    await expect(canvas.getByRole("spinbutton", { name: "Goal" })).toHaveValue(90);
    await expect(canvas.getByRole("textbox", { name: "Measured in" })).toHaveValue("%");
    await expect(canvas.queryByRole("textbox", { name: "Where will you check this?" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("spinbutton", { name: "Check in days" })).toHaveValue(7);
    await changeMode("Verified result");
    await expect(canvas.getByRole("textbox", { name: "What should be true when this is done?" })).toHaveValue(verifiedImpact.result);
    await expect(canvas.queryByRole("textbox", { name: "Where will you check this?" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("spinbutton", { name: "Check in days" })).toHaveValue(7);
  },
};

export const ExpectedGuardrailReview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The default % unit alone is not work: the folded row still reads as required.
    await expect(within(canvas.getByRole("region", { name: "Expected impact" })).getByText("Required")).toBeVisible();
    await openImpact(canvas);
    await expect(canvas.getByRole("textbox", { name: "Measured in" })).toHaveValue("%");
    await fillRequest(canvasElement);
    const editor = await addGuardrail(canvasElement);
    await expect(editor.getByRole("textbox", { name: "Measured in" })).toHaveValue("");
    await userEvent.type(editor.getByRole("textbox", { name: "What should not get worse?" }), "Support requests");
    await expect(canvas.getByRole("button", { name: "Review Request" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Review Request" })).toHaveAccessibleDescription("Add or cancel the guardrail to review your Request.");
    await userEvent.click(editor.getByRole("button", { name: "Add guardrail" }));
    const limit = editor.getByRole("spinbutton", { name: "Number" });
    await waitFor(() => expect(limit).toHaveFocus());
    await expect(limit).toHaveAttribute("aria-invalid", "true");
    await expect(runTriage).not.toHaveBeenCalled();
    await userEvent.type(limit, "20");
    await userEvent.click(editor.getByRole("button", { name: "Add guardrail" }));
    await waitFor(() => expect(editor.getByRole("textbox", { name: "Measured in" })).toHaveFocus());
    await userEvent.type(editor.getByRole("textbox", { name: "Measured in" }), "requests per week");
    await userEvent.click(editor.getByRole("button", { name: "Add guardrail" }));
    await expect(canvas.queryByRole("region", { name: "Guardrail editor" })).not.toBeInTheDocument();
    await expect(within(canvas.getByRole("region", { name: "Guardrail" })).getByText("Support requests must stay at or below 20 requests per week.")).toBeVisible();
    await expect(canvas.queryByText("Add or cancel the guardrail to review your Request.")).not.toBeInTheDocument();
    // Folded, the disclosure reads the impact, then the check (no source: detail's "Check in"), then the guardrail sentence.
    await userEvent.click(canvas.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(canvas.queryByRole("region", { name: "Guardrail" })).not.toBeInTheDocument());
    const impactRow = within(canvas.getByRole("region", { name: "Expected impact" }));
    await expect(impactRow.getByText("Customers finding a saved draft, target 90%")).toBeVisible();
    await expect(impactRow.getByText("Check in 14 days")).toBeVisible();
    await expect(impactRow.getByText("Support requests must stay at or below 20 requests per week.")).toBeVisible();
    await expect(impactRow.queryByText(/, 14 days after launch/)).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    const guardrail = { metric: "Support requests", operator: "at_most", limit: 20, unit: "requests per week" };
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: { ...metricImpact, guardrail } }), context);
    await expect(canvas.getByText("Support requests must stay at or below 20 requests per week.")).toBeVisible();
    await expect(readIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId))?.source.expectedImpact).toMatchObject({ guardrail });
    await userEvent.click(canvas.getByRole("button", { name: "Edit Request" }));
    await openImpact(canvas);
    await expect(canvas.getByRole("region", { name: "Guardrail" })).toHaveTextContent("Support requests must stay at or below 20 requests per week.");
    await expect(canvas.queryByRole("region", { name: "Guardrail editor" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Create Request" }));
    await expect(saveRequest).toHaveBeenCalledWith({ token: "story-review-token", editedProblemText: null }, context);
    await waitForCreatedNotification(canvasElement);
  },
};

export const GuardrailSurvivesModeSwitch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await fillRequest(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const editor = await addGuardrail(canvasElement);
    await userEvent.type(editor.getByRole("textbox", { name: "What should not get worse?" }), "Task completion");
    await userEvent.type(editor.getByRole("spinbutton", { name: "Number" }), "80");
    await userEvent.type(editor.getByRole("textbox", { name: "Measured in" }), "%");
    await userEvent.click(editor.getByRole("combobox", { name: /^Must stay/ }));
    await userEvent.click(await page.findByRole("option", { name: "At or above" }));
    await waitFor(() => expect(canvas.getByRole("combobox", { name: /^Must stay/ })).toHaveFocus());
    for (const name of ["Verified result", "Metric"]) {
      await userEvent.click(canvas.getByRole("combobox", { name: /^Measure with:/ }));
      await userEvent.click(await page.findByRole("option", { name }));
      await waitFor(() => expect(canvas.getByRole("combobox", { name: `Measure with: ${name}` })).toHaveFocus());
      await expect(canvas.getByRole("textbox", { name: "What should not get worse?" })).toHaveValue("Task completion");
      await expect(canvas.getByRole("spinbutton", { name: "Number" })).toHaveValue(80);
      await expect(canvas.getByRole("combobox", { name: /^Must stay/ })).toHaveTextContent("At or above");
      await expect(canvas.getByRole("button", { name: "Review Request" })).toBeDisabled();
    }
    await userEvent.click(canvas.getByRole("button", { name: "Add guardrail" }));
    await expect(canvas.getByRole("region", { name: "Guardrail" })).toHaveTextContent("Task completion must stay at or above 80 %.");
    await userEvent.click(canvas.getByRole("button", { name: "Guardrail options" }));
    await userEvent.click(await page.findByRole("menuitem", { name: "Remove guardrail" }));
    await waitFor(() => expect(canvas.getByRole("button", { name: "Expected impact options" })).toHaveFocus());
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    await expect(runTriage).toHaveBeenLastCalledWith(expect.objectContaining({ expectedImpact: metricImpact }), context);
    await expect(canvas.queryByText("Guardrail metric")).not.toBeInTheDocument();
  },
};

async function addGuardrail(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(canvas.getByRole("button", { name: "Expected impact options" }));
  await userEvent.click(await page.findByRole("menuitem", { name: "Add guardrail" }));
  const editor = within(await canvas.findByRole("region", { name: "Guardrail editor" }));
  await waitFor(() => expect(editor.getByRole("textbox", { name: "What should not get worse?" })).toHaveFocus());
  return editor;
}

export const GuardrailCancelAndSave: Story = {
  play: async ({ canvasElement }) => {
    const canvas = await fillRequest(canvasElement);
    let editor = await addGuardrail(canvasElement);
    await userEvent.type(editor.getByRole("textbox", { name: "What should not get worse?" }), "Discard this draft");
    await userEvent.click(editor.getByRole("button", { name: "Cancel guardrail" }));
    await expect(canvas.queryByRole("region", { name: "Guardrail editor" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("region", { name: "Guardrail" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Review Request" })).toBeEnabled();

    editor = await addGuardrail(canvasElement);
    await expect(editor.getByRole("textbox", { name: "What should not get worse?" })).toHaveValue("");
    await userEvent.type(editor.getByRole("textbox", { name: "What should not get worse?" }), "Support requests");
    await userEvent.type(editor.getByRole("spinbutton", { name: "Number" }), "20");
    await userEvent.type(editor.getByRole("textbox", { name: "Measured in" }), "requests per week");
    await userEvent.click(editor.getByRole("button", { name: "Add guardrail" }));
    await userEvent.click(canvas.getByRole("button", { name: "Edit guardrail" }));
    editor = within(canvas.getByRole("region", { name: "Guardrail editor" }));
    await userEvent.clear(editor.getByRole("spinbutton", { name: "Number" }));
    await userEvent.type(editor.getByRole("spinbutton", { name: "Number" }), "99");
    await expect(canvas.getByRole("button", { name: "Review Request" })).toBeDisabled();
    await userEvent.keyboard("{Meta>}{Enter}{/Meta}{Control>}{Enter}{/Control}");
    await expect(runTriage).not.toHaveBeenCalled();
    await expect(editor.getByRole("spinbutton", { name: "Number" })).toHaveValue(99);
    await userEvent.click(editor.getByRole("button", { name: "Cancel guardrail" }));
    await expect(canvas.getByRole("region", { name: "Guardrail" })).toHaveTextContent("Support requests must stay at or below 20 requests per week.");

    await userEvent.click(canvas.getByRole("button", { name: "Edit guardrail" }));
    editor = within(canvas.getByRole("region", { name: "Guardrail editor" }));
    await expect(editor.getByRole("spinbutton", { name: "Number" })).toHaveValue(20);
    await userEvent.clear(editor.getByRole("spinbutton", { name: "Number" }));
    await userEvent.type(editor.getByRole("spinbutton", { name: "Number" }), "25");
    await userEvent.click(editor.getByRole("button", { name: "Save guardrail" }));
    await expect(canvas.queryByRole("region", { name: "Guardrail editor" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("region", { name: "Guardrail" })).toHaveTextContent("Support requests must stay at or below 25 requests per week.");
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    await expect(canvas.getByText("Support requests must stay at or below 25 requests per week.")).toBeVisible();
  },
};

export const GuardrailEditorRestoredFromDraft: Story = {
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, intakeDraftScope(draftOwnerId, context.orgId), {
      source: {
        ...requestSource,
        expectedImpact: {
          ...metricImpact,
          guardrail: { metric: "Support requests", operator: "at_most", limit: 35, unit: "requests per week" },
          guardrailEdit: {
            previous: { metric: "Support requests", operator: "at_most", limit: 20, unit: "requests per week" },
          },
        },
      },
      review: null,
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editor = within(await canvas.findByRole("region", { name: "Guardrail editor" }));
    await expect(editor.getByRole("textbox", { name: "What should not get worse?" })).toHaveValue("Support requests");
    await expect(editor.getByRole("spinbutton", { name: "Number" })).toHaveValue(35);
    await expect(editor.getByRole("textbox", { name: "Measured in" })).toHaveValue("requests per week");
    await expect(canvas.getByRole("button", { name: "Review Request" })).toBeDisabled();
    await userEvent.click(editor.getByRole("button", { name: "Cancel guardrail" }));
    await expect(canvas.getByRole("region", { name: "Guardrail" })).toHaveTextContent("Support requests must stay at or below 20 requests per week.");
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await visible(await canvas.findByRole("heading", { name: "Review Request" }));
    await expect(canvas.getByText("Support requests must stay at or below 20 requests per week.")).toBeVisible();
  },
};
