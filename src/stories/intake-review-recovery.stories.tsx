import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";
import IntakeForm from "@/app/(app)/intake/intake-form";
import { runTriage, saveRequest } from "@/app/(app)/intake/actions";
import { listProjects } from "@/app/(app)/intake/project-actions";
import { Button } from "@/components/arc/button/button";
import { ToastStack, ToastStackProvider } from "@/components/arc/toast-stack/toast-stack";
import { clearIntakeDraft, intakeDraftScope, readIntakeDraft, writeIntakeDraft } from "@/lib/intake-draft";
import { metricImpact } from "./fixtures/request-impact";

const context = { orgId: "storybook-review-recovery" };
const draftOwnerId = "storybook-review-recovery-person";
const scope = intakeDraftScope(draftOwnerId, context.orgId);
const source = {
  title: "Add a saved-drafts tab",
  description: "Add a tab so returning customers can recover unfinished drafts.",
  expectedImpact: metricImpact,
  affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "https://example.test/research",
};
const oldProblem = "Returning customers cannot identify which draft contains their latest changes.";
const nextProblem = "Customers cannot tell whether their card payment completed successfully.";
const nextDescription = "Add a confirmation screen after customers finish a card payment.";
const solution = { classification: "solution" as const, reframedProblem: oldProblem, extractedSolution: null };

function RecoveryFixture() {
  const [mount, setMount] = useState(0);
  return <ToastStackProvider><Button variant="secondary" type="button" onClick={() => setMount((value) => value + 1)}>Reload form fixture</Button><div onClick={(event) => { if ((event.target as Element).closest("a[href^='/login']")) event.preventDefault(); }}><IntakeForm key={mount} context={context} draftOwnerId={draftOwnerId} onCreated={fn()} /></div><ToastStack /></ToastStackProvider>;
}

const meta = {
  title: "Intake/Review recovery",
  component: RecoveryFixture,
  parameters: { layout: "fullscreen", nextjs: { appDirectory: true, navigation: { pathname: "/intake" } } },
  beforeEach: () => {
    clearIntakeDraft(window.sessionStorage, scope);
    writeIntakeDraft(window.sessionStorage, scope, { source, review: { triage: solution, token: "old-review-token", editedProblem: oldProblem } });
    mocked(listProjects).mockReset().mockResolvedValue({ success: true, projects: [] });
    mocked(runTriage).mockReset().mockResolvedValue({ success: true, triage: { ...solution, reframedProblem: nextProblem }, token: "new-review-token" });
    mocked(saveRequest).mockReset().mockResolvedValue({ success: true, requestId: "00000000-0000-4000-8000-000000000321" });
  },
} satisfies Meta<typeof RecoveryFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

async function editDescription(canvas: ReturnType<typeof within>) {
  await userEvent.click(await canvas.findByRole("button", { name: "Edit Request" }));
  const description = canvas.getByRole("textbox", { name: "Description" });
  await userEvent.clear(description);
  await userEvent.type(description, nextDescription);
}

export const ChangedRequestFailedRetry: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await editDescription(canvas);
    mocked(runTriage).mockRejectedValueOnce(new Error("Offline fixture"));
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await canvas.findByText(/Check your connection and try again/);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await expect(await canvas.findByRole("textbox", { name: "Problem to solve" })).toHaveValue(nextProblem);
    await expect(canvas.getByRole("region", { name: "Expected impact" })).toHaveTextContent(metricImpact.metric);
  },
};

export const ChangedRequestReload: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await editDescription(canvas);
    await waitFor(() => expect(readIntakeDraft(window.sessionStorage, scope)?.source.description).toBe(nextDescription));
    await userEvent.click(canvas.getByRole("button", { name: "Reload form fixture" }));
    await expect(await canvas.findByRole("textbox", { name: "Description" })).toHaveValue(nextDescription);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await expect(await canvas.findByRole("textbox", { name: "Problem to solve" })).toHaveValue(nextProblem);
  },
};

export const SignInPreservesEarlierProblem: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Edit Request" }));
    mocked(runTriage).mockResolvedValueOnce({ success: false, error: { code: "session_expired", message: "Your session ended. Sign in again to continue this Request." } });
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await userEvent.click(await canvas.findByRole("link", { name: "Sign in again" }));
    await expect(readIntakeDraft(window.sessionStorage, scope)?.previousProblem).toBe(oldProblem);
  },
};

export const ExpiredReviewKeepsCorrection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const correction = "People cannot locate the draft they were editing before their session ended.";
    const problem = await canvas.findByRole("textbox", { name: "Problem to solve" });
    await userEvent.clear(problem);
    await userEvent.type(problem, correction);
    mocked(saveRequest).mockResolvedValueOnce({ success: false, error: { code: "review_expired", message: "This review has expired. Review it again to continue." } });
    await userEvent.click(canvas.getByRole("button", { name: "Create Request" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Review again" }));
    await expect(await canvas.findByRole("textbox", { name: "Problem to solve" })).toHaveValue(correction);
    await userEvent.click(canvas.getByRole("button", { name: "Create Request" }));
    await expect(saveRequest).toHaveBeenLastCalledWith({ token: "new-review-token", editedProblemText: correction }, context);
  },
};

export const ExpiredReviewRetryFailure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const correction = "Returning customers cannot find the draft that contains their latest edits.";
    const input = await canvas.findByRole("textbox", { name: "Problem to solve" });
    await userEvent.clear(input);
    await userEvent.type(input, correction);
    mocked(saveRequest).mockResolvedValueOnce({ success: false, error: { code: "review_expired", message: "This review has expired. Review it again to continue." } });
    await userEvent.click(canvas.getByRole("button", { name: "Create Request" }));
    mocked(runTriage).mockRejectedValueOnce(new Error("First offline fixture")).mockRejectedValueOnce(new Error("Second offline fixture"));
    await userEvent.click(await canvas.findByRole("button", { name: "Review again" }));
    await canvas.findByText(/Check your connection and try again/);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await canvas.findByText(/Check your connection and try again/);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await expect(await canvas.findByRole("textbox", { name: "Problem to solve" })).toHaveValue(correction);
  },
};

export const LegacyWordingHasNoAssumedOrigin: Story = {
  beforeEach: () => {
    writeIntakeDraft(window.sessionStorage, scope, { source: { ...source, description: nextDescription }, review: null, previousProblem: oldProblem });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("region", { name: "Problem from your earlier review" })).toHaveTextContent(oldProblem);
    await userEvent.click(canvas.getByRole("button", { name: "Review Request" }));
    await expect(await canvas.findByRole("textbox", { name: "Problem to solve" })).toHaveValue(nextProblem);
  },
};
