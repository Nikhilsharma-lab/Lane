import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, mocked, userEvent, within, waitFor } from "storybook/test";
import { RequestAgreementPanel } from "@/components/requests/request-agreement-panel";
import * as api from "@/app/(app)/requests/[id]/agreement-actions";
import type {
  AgreementSeats,
  PreparedAgreement,
  AgreementSnapshot,
} from "@/lib/request-agreement";
const requestId = "00000000-0000-4000-a000-000000005800";
const prepared: PreparedAgreement = {
  version: 1,
  commitmentKind: "delivery",
  scopeIncluded: "Checkout error recovery",
  scopeExcluded: "Payment-provider migration",
  audience: "Returning shoppers",
  timing: "Before the November campaign",
  constraints: "Keep the existing payment provider",
  feasibility: "API capacity checked with the development lead",
};
const seats: AgreementSeats = {
  pm: {
    generation: 1,
    nominee: { kind: "member", userId: "pm" },
    decision: null,
    displayNameAtSelection: "Maya Chen",
  },
  designer: {
    generation: 1,
    nominee: { kind: "member", userId: "design" },
    decision: null,
    displayNameAtSelection: "Alex Morgan",
  },
  developer: {
    generation: 1,
    nominee: {
      kind: "invitation",
      invitationId: "inv-dev",
      email: "dev@example.test",
    },
    decision: null,
    displayNameAtSelection: "dev@example.test",
  },
};
const request: AgreementSnapshot["request"] = {
  title: "Shoppers lose their checkout after an error",
  description:
    "Returning shoppers have to enter their payment details again after a recoverable error.",
  classification: "problem",
  reframedProblem: null,
  extractedSolution: null,
  affectedPeople: "Returning shoppers",
  desiredChange: null,
  observedEvidence: null,
  uncertainty: null,
  usefulLink: null,
  requestType: "improvement",
  projectId: null,
  labelKeys: null,
  expectedImpact: {
    kind: "measurement",
    version: 2,
    primary: {
      key: "conversion",
      name: "",
      unit: "percent",
      current: 50,
      target: 80,
      noBaseline: false,
      check: "",
    },
    measurement: {
      audience: "returning",
      platform: "web",
      windowDays: 30,
      exactDates: false,
      startDate: "",
      endDate: "",
    },
    guardrails: [],
  },
};
const view = {
  released: false,
  eligibleSeats: ["pm"] as ("pm" | "designer" | "developer")[],
  invitationStates: { developer: "pending" },
  requestId,
  revision: 1,
  creatorId: "pm",
  closure: null,
  attachments: [],
  history: [],
  links: [],
  commitmentToken: "a".repeat(64),
  request,
  agreement: {
    orgId: "org-story",
    requestId,
    prepared,
    snapshot: null as AgreementSnapshot | null,
    submittedBy: null as string | null,
    submittedAt: null as Date | null,
    seats,
    concerns: [],
  },
};
const submitted = {
  ...view,
  revision: 2,
  agreement: {
    ...view.agreement,
    snapshot: { version: 1 as const, request, prepared, attachmentIds: [] },
    submittedBy: "pm",
    submittedAt: new Date("2026-10-21T08:00:00Z"),
  },
};
const meta = {
  title: "Requests/Agreement",
  component: RequestAgreementPanel,
  parameters: { layout: "padded" },
  args: {
    requestId,
    orgId: "org-story",
    userId: "pm",
    isAdmin: false,
    isGuest: false,
  },
  beforeEach: () => {
    localStorage.removeItem(`lane:agreement:org-story:pm:${requestId}`);
    mocked(api.readAgreement)
      .mockReset()
      .mockResolvedValue(structuredClone(view));
    mocked(api.loadAgreementPeople)
      .mockReset()
      .mockResolvedValue({
        people: Object.values(seats).map((s) => ({
          nominee: s!.nominee,
          name: s!.displayNameAtSelection,
          email:
            s!.nominee.kind === "invitation"
              ? s!.nominee.email
              : `${s!.displayNameAtSelection}@example.test`,
        })),
      });
    mocked(api.submitAgreement).mockReset();
    mocked(api.decideAgreement).mockReset();
    mocked(api.prepareAgreement).mockReset();
  },
} satisfies Meta<typeof RequestAgreementPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PrepareAndSubmit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Request agreement" });
    await expect(canvas.getByLabelText("Included scope")).toHaveValue(
      "Checkout error recovery",
    );
    await expect(
      canvas.getByText("Missing someone? Ask an admin to invite them."),
    ).toBeVisible();
    mocked(api.submitAgreement).mockImplementation(async () => {
      mocked(api.readAgreement).mockResolvedValue(structuredClone(submitted));
      return { success: true, revision: 2 };
    });
    canvas.getByRole("button", { name: "Request agreement" }).focus();
    await userEvent.keyboard("{Enter}");
    await canvas.findByText(
      "Agreement blocked: all three participants must agree.",
    );
    await userEvent.click(
      canvas.getByText("Inspect the exact submitted commitment"),
    );
    await expect(canvas.getByText(request.title)).toBeVisible();
    await expect(
      canvas.getByText("API capacity checked with the development lead"),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Agree as PM" }),
    ).toBeVisible();
    await expect(
      canvas.getAllByText(/dev@example.test · Invitation pending/)[0],
    ).toBeVisible();
  },
};
export const FailedDecisionRetainsReason: Story = {
  beforeEach: () => {
    mocked(api.readAgreement).mockResolvedValue(structuredClone(submitted));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const reason = await canvas.findByRole("textbox", {
      name: "Reason or resolution",
    });
    await userEvent.type(reason, "The fallback API still fails.");
    mocked(api.decideAgreement)
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValue({
        error: "Agreement changed. Reload before trying again.",
      });
    const button = canvas.getAllByRole("button", {
      name: "Request changes",
    })[0];
    await userEvent.click(button);
    await canvas.findByRole("alert");
    await expect(reason).toHaveValue("The fallback API still fails.");
    await expect(button).toBeEnabled();
    const operation = mocked(api.decideAgreement).mock.calls[0][0].operationId;
    await userEvent.click(button);
    await waitFor(() =>
      expect(mocked(api.decideAgreement).mock.calls[1][0].operationId).toBe(
        operation,
      ),
    );
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Agreement changed",
    );
  },
};
export const UnsavedPreparation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const submit = await canvas.findByRole("button", {
      name: "Request agreement",
    });
    const scope = canvas.getByLabelText("Included scope");
    await userEvent.type(scope, " and refunds");
    await expect(submit).toBeDisabled();
    mocked(api.prepareAgreement).mockImplementation(async () => {
      mocked(api.readAgreement).mockResolvedValue({
        ...structuredClone(view),
        revision: 2,
        agreement: {
          ...structuredClone(view.agreement),
          prepared: {
            ...prepared,
            scopeIncluded: "Checkout error recovery and refunds",
          },
        },
      });
      return { success: true, revision: 2 };
    });
    await userEvent.click(
      canvas.getByRole("button", { name: "Save preparation" }),
    );
    await waitFor(() => expect(submit).toBeEnabled());
  },
};
export const Guest: Story = {
  args: { isGuest: true, userId: "pm" },
  beforeEach: () => {
    mocked(api.readAgreement).mockResolvedValue(structuredClone(submitted));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Inspect the exact submitted commitment");
    await expect(
      canvas.queryByRole("button", { name: /Agree as/ }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("textbox", { name: "Reason or resolution" }),
    ).not.toBeInTheDocument();
  },
};
export const Superseded: Story = {
  beforeEach: () => {
    mocked(api.readAgreement).mockResolvedValue({
      ...structuredClone(submitted),
      closure: {
        version: 1,
        kind: "exception",
        reasonCode: "superseded",
        reason: "Scope changed",
        actorId: "pm",
        closedAt: "2026-10-21T09:00:00Z",
        replacementId: "00000000-0000-4000-a000-000000005801",
      },
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText(
      "Superseded · Exception excluded from measured impact",
    );
    await expect(
      canvas.queryByRole("button", { name: /Agree as/ }),
    ).not.toBeInTheDocument();
  },
};

export const EmptyPreparation: Story = {
  beforeEach: () => {
    mocked(api.readAgreement).mockResolvedValue({
      ...structuredClone(view),
      agreement: null,
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: "Save preparation" });
    await expect(canvas.getByLabelText("Included scope")).toHaveValue("");
    await expect(
      canvas.queryByRole("button", { name: "Request agreement" }),
    ).not.toBeInTheDocument();
  },
};
export const ReadFailureRetry: Story = {
  beforeEach: () => {
    mocked(api.readAgreement).mockRejectedValue(new Error("Offline"));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("alert");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "Could not load agreement",
    );
    mocked(api.readAgreement).mockResolvedValue(structuredClone(view));
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    await canvas.findByRole("button", { name: "Save preparation" });
  },
};
