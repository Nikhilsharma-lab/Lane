import { ToastStack } from "@/components/arc/toast-stack/toast-stack";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { ProfileRoleForm } from "@/components/settings/profile-role-form";

const meta = { decorators: [(Story) => <><Story /><ToastStack morph="plain" label="Messages" /></>], title: "Settings/Role auto-save", component: ProfileRoleForm, args: { initialRole: "designer", autoSave: true, onSave: async () => ({ success: true }) } } satisfies Meta<typeof ProfileRoleForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SavesOnSelection: Story = {
  args: { onSave: async () => ({ success: true }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Developer" }));
    await expect(await within(canvas.getByRole("region", { name: /^Messages/ })).findByText("Role updated.")).toBeVisible();
    expect(canvas.queryByRole("button", { name: "Save role" })).not.toBeInTheDocument();
  },
};
export const FailureAndRetry: Story = {
  render: (args) => { let attempt = 0; return <ProfileRoleForm {...args} onSave={async () => ++attempt === 1 ? { error: "Connection interrupted." } : { success: true }} />; },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "PM" }));
    await expect(await canvas.findByText("Connection interrupted.")).toBeVisible();
    await expect(canvas.getByRole("radio", { name: "PM" })).toBeChecked();
    await userEvent.click(await canvas.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(canvas.getByText("Role updated.")).toBeVisible());
  },
};
export const PreventsConcurrentSaves: Story = {
  args: { onSave: () => new Promise<{ success: true }>(resolve => setTimeout(() => resolve({ success: true }), 500)) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "PM" }));
    await expect(canvas.getByText("Saving role…")).toBeVisible();
    await expect(canvas.getByRole("radio", { name: "Developer" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("radio", { name: "Developer" }));
    await expect(await within(canvas.getByRole("region", { name: /^Messages/ })).findByText("Role updated.")).toBeVisible();
    await expect(canvas.getByRole("radio", { name: "PM" })).toBeChecked();
    await waitFor(() => expect(canvas.getByRole("radio", { name: "Developer" })).toBeEnabled());
  },
};
