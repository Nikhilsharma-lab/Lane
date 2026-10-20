import { ToastStack } from "@/components/arc/toast-stack/toast-stack";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within, waitFor } from "storybook/test";
import { useState } from "react";
import { ProfileRoleForm, type ProductRole } from "@/components/settings/profile-role-form";
import { PendingMutationsProvider } from "@/components/requests/pending-mutations-provider";
import { Button } from "@/components/arc/button/button";

type SaveResult = { error?: string; success?: boolean };
type SaveRole = (role: ProductRole) => Promise<SaveResult>;

const held = fn<SaveRole>();
const refused = fn<SaveRole>();
const rejected = fn<SaveRole>();
const queued = fn<SaveRole>();
const expired = fn<SaveRole>();

/** Saves the story finishes by hand, so it can look at the screen while the server is still working. */
function holdSaves(mock: typeof held) {
  const pending: ((value: SaveResult) => void)[] = [];
  mock.mockImplementation(() => new Promise<SaveResult>((resolve) => { pending.push(resolve); }));
  return pending;
}

const radio = (canvasElement: HTMLElement, name: "PM" | "Designer" | "Developer") => within(canvasElement).getByRole("radio", { name });
const messages = (canvasElement: HTMLElement) => within(within(canvasElement.ownerDocument.body).getByRole("region", { name: /^Messages/ }));
/** Toast copy fades in, so wait for it to settle visible. */
async function shown(canvasElement: HTMLElement, text: string) {
  const element = await messages(canvasElement).findByText(text);
  await waitFor(() => expect(element).toBeVisible());
}

// Plan item 2.9: the role saves on change, optimistically. The app layout hosts the
// pending-mutation overlay that queues the saves; the root layout hosts the toasts.
const meta = {
  decorators: [(Story) => <PendingMutationsProvider><Story /><ToastStack morph="plain" label="Messages" /></PendingMutationsProvider>],
  title: "Settings/Role auto-save", component: ProfileRoleForm,
  parameters: { nextjs: { appDirectory: true } },
  args: { initialRole: "designer", autoSave: true, onSave: fn<SaveRole>().mockResolvedValue({ success: true }) },
} satisfies Meta<typeof ProfileRoleForm>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Acknowledgement contract: the choice and its toast are in the page as soon as the click returns, while the save is still pending; nothing is disabled or asks to be saved. */
export const SavesOnSelection: Story = {
  args: { onSave: held },
  beforeEach: () => { held.mockReset(); },
  play: async ({ canvasElement }) => {
    const pending = holdSaves(held);
    await userEvent.click(radio(canvasElement, "Developer"));
    // Synchronous reads, no polling: these hold in the frame the click lands in.
    expect(radio(canvasElement, "Developer")).toBeChecked();
    expect(messages(canvasElement).getByText("Role changed")).toBeInTheDocument();
    expect(messages(canvasElement).getByText("Your profile label is now Developer.")).toBeInTheDocument();
    expect(radio(canvasElement, "PM")).toBeEnabled();
    expect(held).toHaveBeenCalledTimes(1); expect(held).toHaveBeenCalledWith("developer");
    expect(within(canvasElement).queryByRole("button", { name: /save|retry/i })).not.toBeInTheDocument();
    await shown(canvasElement, "Role changed");
    pending[0]({ success: true });
    await waitFor(() => expect(radio(canvasElement, "Developer")).toBeChecked());
    expect(messages(canvasElement).queryByText("Could not save your role")).not.toBeInTheDocument();
  },
};

/** Production's compact Select: the new role shows on the trigger as soon as it is picked, and that role is what is saved. */
export const CompactSelectSavesOnChange: Story = {
  args: { onSave: held, compact: true },
  beforeEach: () => { held.mockReset(); },
  play: async ({ canvasElement }) => {
    holdSaves(held);
    const select = within(canvasElement).getByRole("combobox", { name: "Role" });
    await userEvent.click(select);
    await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("option", { name: "PM" }));
    expect(select).toHaveTextContent("PM");
    expect(select).toBeEnabled();
    expect(held).toHaveBeenCalledTimes(1); expect(held).toHaveBeenCalledWith("pm");
    expect(within(canvasElement).getByText("Your role is saved automatically.")).toBeInTheDocument();
    // The listbox closes after the pick; the page leaves Radix's modal state before the accessibility check runs.
    await waitFor(() => expect(canvasElement.querySelector("[aria-hidden='true'] button")).toBeNull());
  },
};

/** A refused save puts back the confirmed role and turns its toast into the reason; the same choice can be made again. */
export const FailureRevertsWithReason: Story = {
  args: { onSave: refused },
  beforeEach: () => { refused.mockReset(); refused.mockResolvedValueOnce({ error: "Connection interrupted." }).mockResolvedValue({ success: true }); },
  play: async ({ canvasElement }) => {
    await userEvent.click(radio(canvasElement, "PM"));
    await shown(canvasElement, "Could not save your role");
    await shown(canvasElement, "Connection interrupted.");
    await waitFor(() => expect(radio(canvasElement, "Designer")).toBeChecked());
    await userEvent.click(radio(canvasElement, "PM"));
    await waitFor(() => expect(refused).toHaveBeenCalledTimes(2));
    await expect(radio(canvasElement, "PM")).toBeChecked();
  },
};

/** A lost response reverts with the connection message. */
export const ThrownSaveReverts: Story = {
  args: { onSave: rejected },
  beforeEach: () => { rejected.mockReset(); rejected.mockRejectedValue(new Error("Fixture network interruption")); },
  play: async ({ canvasElement }) => {
    await userEvent.click(radio(canvasElement, "Developer"));
    await shown(canvasElement, "Check your connection and try again.");
    await waitFor(() => expect(radio(canvasElement, "Designer")).toBeChecked());
    await expect(rejected).toHaveBeenCalledTimes(1);
  },
};

/** Saves run one at a time, in order; a choice overtaken while it waited is never sent. */
export const QueuedChoicesKeepOrder: Story = {
  args: { onSave: queued },
  beforeEach: () => { queued.mockReset(); },
  play: async ({ canvasElement }) => {
    const pending = holdSaves(queued);
    await userEvent.click(radio(canvasElement, "Developer"));
    await userEvent.click(radio(canvasElement, "PM"));
    await userEvent.click(radio(canvasElement, "Designer"));
    await expect(radio(canvasElement, "Designer")).toBeChecked();
    await expect(queued).toHaveBeenCalledTimes(1);
    pending[0]({ success: true });
    // PM was overtaken by Designer before its turn, so only Designer follows Developer.
    await waitFor(() => expect(queued).toHaveBeenCalledTimes(2));
    await expect(queued).toHaveBeenNthCalledWith(2, "designer");
    pending[1]({ error: "Your role could not be saved. Try again." });
    // The failure puts back the role the server confirmed last: Developer.
    await waitFor(() => expect(radio(canvasElement, "Developer")).toBeChecked());
  },
};

/** A choice waiting behind a failure is never sent and goes back with it. The failure replaces the waiting choice's toast, and the error toast can be reached. */
export const QueuedChoiceSkippedAfterFailure: Story = {
  args: { onSave: queued },
  beforeEach: () => { queued.mockReset(); },
  play: async ({ canvasElement }) => {
    const pending = holdSaves(queued);
    await userEvent.click(radio(canvasElement, "Developer"));
    await userEvent.click(radio(canvasElement, "PM"));
    pending[0]({ error: "Your role could not be saved. Try again." });
    await shown(canvasElement, "Could not save your role");
    await waitFor(() => expect(radio(canvasElement, "Designer")).toBeChecked());
    await expect(queued).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(messages(canvasElement).queryByText("Your profile label is now PM.")).not.toBeInTheDocument());
    expect(messages(canvasElement).getByText("Could not save your role").closest("[inert]")).toBeNull();
  },
};

/** A save rejected for an expired session before the action runs (an auth-shaped throw) refreshes the Clerk token and retries once; the person sees only the saved role. A refusal the action itself returns is shown as it is. */
export const ExpiredSessionRetriesOnce: Story = {
  args: { onSave: expired },
  beforeEach: () => { expired.mockReset(); expired.mockRejectedValueOnce(new Error("401 Unauthorized")).mockResolvedValue({ success: true }); },
  play: async ({ canvasElement }) => {
    await userEvent.click(radio(canvasElement, "Developer"));
    await waitFor(() => expect(expired).toHaveBeenCalledTimes(2));
    await expect(radio(canvasElement, "Developer")).toBeChecked();
    expect(messages(canvasElement).queryByText("Could not save your role")).not.toBeInTheDocument();
  },
};

/** With no save in flight, a role the server sends (after a refresh, or from another tab) replaces the one shown. */
export const AdoptsServerRole: Story = {
  render: function Render(args) {
    const [initialRole, setInitialRole] = useState<ProductRole>("designer");
    return <>
      <ProfileRoleForm {...args} initialRole={initialRole} />
      <Button variant="secondary" size="sm" onClick={() => setInitialRole("developer")}>Server sends Developer</Button>
    </>;
  },
  args: { onSave: rejected },
  beforeEach: () => { rejected.mockReset(); rejected.mockRejectedValue(new Error("Fixture lost response")); },
  play: async ({ canvasElement }) => {
    // The update reached the database but its response was lost: the form reverts, then the refresh brings Developer.
    await userEvent.click(radio(canvasElement, "Developer"));
    await waitFor(() => expect(radio(canvasElement, "Designer")).toBeChecked());
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Server sends Developer" }));
    await waitFor(() => expect(radio(canvasElement, "Developer")).toBeChecked());
  },
};
