import { ToastStack } from "@/components/arc/toast-stack/toast-stack";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within, waitFor } from "storybook/test";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { AccountDetails } from "@/components/settings/account-details";
import { ProfileRoleForm } from "@/components/settings/profile-role-form";
import { ThemePreference } from "@/app/(app)/settings/profile/theme-preference";
import { FutureRow } from "@/components/settings/coming-soon-panel";

const meta = { decorators: [(Story) => <><Story /><ToastStack morph="plain" label="Messages" /></>],
  title: "Settings/Settings", component: SettingsCommandAdapter,
  parameters: { layout: "fullscreen" },
  args: {
    membership: "admin", workspaceName: "Lane Studio",
    account: <AccountDetails name="Alex Morgan" email="alex@example.com" />,
    role: <ProfileRoleForm compact autoSave initialRole="designer" onSave={async () => ({ success: true })} />,
    appearance: <ThemePreference compact />,
    security: <FutureRow title="Account security preview" description="The app opens Clerk to manage your real account. This Storybook preview is not connected to an account." />,
  },
  beforeEach: () => {
    const original = window.location.href;
    const next = new URL(original); next.searchParams.delete("section"); next.hash = "";
    window.history.replaceState(null, "", next);
    window.dispatchEvent(new Event("lane-settings-navigation"));
    return () => { window.history.replaceState(null, "", original); window.dispatchEvent(new Event("lane-settings-navigation")); };
  },
} satisfies Meta<typeof SettingsCommandAdapter>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Profile: Story = { parameters: { browserTheme: true } };
export const FutureSettings: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("link", { name: "Coming soon" }));
    await expect(canvas.getByRole("heading", { name: "Coming soon", level: 2 })).toBeVisible();
    await expect(canvas.getByRole("region", { name: "Future settings" })).toHaveTextContent("Billing");
    for (const button of within(canvas.getByRole("region", { name: "Future settings" })).getAllByRole("button")) expect(button).toBeDisabled();
    await userEvent.click(canvas.getByRole("link", { name: "Profile" }));
    await expect(canvas.getByRole("heading", { name: "Profile", level: 2 })).toBeVisible();
  },
};
export const SearchAndKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: /Search settings/ });
    await userEvent.click(trigger);
    const input = await canvas.findByRole("combobox", { name: "Search settings" });
    await userEvent.type(input, "dark mode");
    await expect(canvas.getByRole("option", { name: /Theme/ })).toBeVisible();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(canvas.getByRole("heading", { name: "Preferences", level: 2 })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole("button", { name: "System" })).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.type(await canvas.findByRole("combobox", { name: "Search settings" }), "zzzzzz");
    await expect(canvas.getByRole("status")).toHaveTextContent("No settings match");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
export const Guest: Story = {
  args: { membership: "guest" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByRole("link", { name: "Members" })).not.toBeInTheDocument();
    expect(canvas.queryByRole("link", { name: /Billing/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: /Search settings/ }));
    await userEvent.type(await canvas.findByRole("combobox", { name: "Search settings" }), "invite");
    expect(canvas.queryByRole("option")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
  },
};
export const LongIdentity: Story = {
  args: { account: <AccountDetails name="Alexandra Morgan-Williams with a very long display name" email="alexandra.morgan-williams.with.a.long.address@example.company" /> },
  play: async ({ canvasElement }) => {
    await canvasElement.ownerDocument.fonts.ready;
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
  },
};

export const CompactRoleSave: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("combobox", { name: "Role" }));
    await userEvent.click(await within(document.body).findByRole("option", { name: "PM" }));
    await expect(await canvas.findByText("Role updated.")).toBeVisible();
    await waitFor(() => expect(canvas.getByRole("combobox", { name: "Role" })).toHaveTextContent("PM"));
  },
};
export const SearchFutureSetting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Search settings/ }));
    await userEvent.type(await canvas.findByRole("combobox", { name: "Search settings" }), "billing");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(canvas.getByRole("heading", { name: "Coming soon", level: 2 })).toBeVisible();
    await waitFor(() => expect(document.getElementById("future-billing")).toHaveFocus());
    expect(canvas.queryByRole("link", { name: /Billing/ })).not.toBeInTheDocument();
  },
};

export const SeparateSections: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole("heading", { name: "Profile", level: 2 })).toBeVisible();
    expect(canvas.queryByRole("heading", { name: "Preferences", level: 2 })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("link", { name: "Preferences" }));
    expect(canvas.getByRole("heading", { name: "Preferences", level: 2 })).toBeVisible();
    expect(canvas.queryByRole("heading", { name: "Profile", level: 2 })).not.toBeInTheDocument();
    expect(canvas.getByRole("link", { name: "Preferences" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(canvas.getByRole("link", { name: "Members" }));
    expect(canvas.getByRole("heading", { name: "Members", level: 2 })).toBeVisible();
    expect(canvas.queryByRole("group", { name: "Theme" })).not.toBeInTheDocument();
  },
};
