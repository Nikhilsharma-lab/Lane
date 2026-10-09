import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";
import { useState } from "react";
import { UserMenu } from "@/components/arc/user-menu/user-menu";

const user = { name: "Nikhil Sharma", email: "nikhil@example.com" };
const workspaceOptions = [{ id: "lane", name: "Lane" }, { id: "studio", name: "Design Studio" }];
const meta = {
  title: "Navigation/User menu workspaces",
  component: UserMenu,
  args: { user, showTheme: false, onSignOut: fn() },
  parameters: { layout: "padded" },
} satisfies Meta<typeof UserMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

async function openMenu(canvasElement: HTMLElement) {
  const trigger = within(canvasElement).getByRole("button", { name: "Account menu, Nikhil Sharma" });
  trigger.focus();
  await userEvent.keyboard("{ArrowDown}");
  const page = within(canvasElement.ownerDocument.body);
  await waitFor(() => expect(page.getByRole("menu")).toBeVisible());
  await waitFor(() => expect(page.getByRole("menu").getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight + 1));
  await waitFor(() => expect(getComputedStyle(page.getByRole("menu")).opacity).toBe("1"));
  await waitFor(() => expect(getComputedStyle(page.getByText(user.email).parentElement!.parentElement!).opacity).toBe("1"));
  return { page, trigger };
}

export const WorkspaceKeyboardAndBack: Story = {
  render: args => <UserMenu {...args} {...{ workspaces: { items: workspaceOptions, currentId: "lane", onSelect: fn() } }} />,
  play: async ({ canvasElement }) => {
    const { page, trigger } = await openMenu(canvasElement);
    const switcher = page.getByRole("menuitem", { name: "Switch workspace" });
    switcher.focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(page.getByRole("menuitemradio", { name: "Lane" })).toHaveFocus());
    await expect(page.getByRole("menuitemradio", { name: "Lane" })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{ArrowDown}");
    await expect(page.getByRole("menuitemradio", { name: "Design Studio" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("menuitemradio", { name: "Design Studio" })).not.toBeInTheDocument());
    await expect(page.getByRole("menuitem", { name: "Switch workspace" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};

export const SignOutFailureCanRetry: Story = {
  args: { onSignOut: fn() },
  play: async ({ canvasElement, args }) => {
    mocked(args.onSignOut!).mockRejectedValueOnce(new Error("Unavailable")).mockResolvedValueOnce(undefined);
    const { page, trigger } = await openMenu(canvasElement);
    await userEvent.click(page.getByRole("menuitem", { name: "Sign out" }));
    await expect(args.onSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(page.getByRole("alert")).toHaveTextContent("Couldn’t sign out. Try again."));
    await expect(page.getByRole("menu")).toBeVisible();
    await userEvent.click(page.getByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await expect(args.onSignOut).toHaveBeenCalledTimes(2);
    await expect(trigger).toHaveFocus();
  },
};

export const WorkspaceFailureAndPending: Story = {
  render: args => {
    const onSelect = fn().mockRejectedValueOnce(new Error("Unavailable")).mockImplementationOnce(() => new Promise(resolve => { window.setTimeout(resolve, 300); }));
    return <UserMenu {...args} workspaces={{ items: workspaceOptions, currentId: "lane", onSelect }} />;
  },
  play: async ({ canvasElement }) => {
    const { page, trigger } = await openMenu(canvasElement);
    await userEvent.click(page.getByRole("menuitem", { name: "Switch workspace" }));
    const studio = await page.findByRole("menuitemradio", { name: "Design Studio" });
    await waitFor(() => expect(studio).toBeVisible());
    await userEvent.click(studio);
    await waitFor(() => expect(page.getByRole("alert")).toHaveTextContent("Couldn’t switch workspace. Try again."));
    await expect(studio).toHaveFocus();
    await userEvent.click(studio);
    await expect(studio).toHaveAttribute("aria-busy", "true");
    await expect(page.getByRole("menuitemradio", { name: "Lane" })).toHaveAttribute("aria-disabled", "true");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};

function LoadingFixture() {
  const [state, setState] = useState<"error" | "ready" | "complete">("error");
  return <UserMenu user={user} showTheme={false} workspaces={{
    items: state === "error" ? [] : state === "ready" ? [workspaceOptions[0]] : workspaceOptions,
    currentId: "lane", error: state === "error" ? "Couldn’t load workspaces." : null,
    onRetry: () => setState("ready"), hasMore: state === "ready", onLoadMore: () => setState("complete"), onSelect: fn(),
  }} />;
}

export const WorkspaceRetryAndPagination: Story = {
  render: () => <LoadingFixture />,
  play: async ({ canvasElement }) => {
    const { page } = await openMenu(canvasElement);
    await userEvent.click(page.getByRole("menuitem", { name: "Switch workspace" }));
    const retry = await page.findByRole("menuitem", { name: "Try again" });
    await waitFor(() => expect(retry).toBeVisible());
    await userEvent.click(retry);
    await waitFor(() => expect(page.getByRole("menuitemradio", { name: "Lane" })).toHaveFocus());
    await userEvent.click(page.getByRole("menuitem", { name: "Load more workspaces" }));
    await waitFor(() => expect(page.getByRole("menuitemradio", { name: "Design Studio" })).toBeVisible());
    await waitFor(() => expect(page.getByRole("menuitemradio", { name: "Lane" })).toHaveFocus());
    await userEvent.keyboard("{Escape}{Escape}");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};

export const NativeLinksPreserveModifiedClick: Story = {
  args: { items: [{ label: "Settings", href: "/settings/profile", current: true, onSelect: fn() }] },
  play: async ({ canvasElement, args }) => {
    const { page } = await openMenu(canvasElement);
    const destination = page.getByRole("menuitem", { name: "Settings" });
    await expect(destination.tagName).toBe("A");
    await expect(destination).toHaveAttribute("href", "/settings/profile");
    await expect(destination).toHaveAttribute("aria-current", "page");
    const preventNavigation = (event: Event) => { if ((event.target as Element).closest("a")) event.preventDefault(); };
    canvasElement.ownerDocument.addEventListener("click", preventNavigation);
    try {
      destination.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
      await expect(args.items?.[0].onSelect).not.toHaveBeenCalled();
      await expect(page.getByRole("menu")).toBeVisible();
      await userEvent.click(destination);
      await expect(args.items?.[0].onSelect).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    } finally { canvasElement.ownerDocument.removeEventListener("click", preventNavigation); }
  },
};

export const SubmenuStaysInsideViewport: Story = {
  render: args => <div style={{ display: "flex", justifyContent: "flex-end" }}><UserMenu {...args} workspaces={{
    items: [{ id: "lane", name: "Lane" }, ...Array.from({ length: 25 }, (_, index) => ({ id: `workspace-${index}`, name: `Workspace ${index} with a deliberately long name` }))],
    currentId: "lane", onSelect: fn(),
  }} /></div>,
  play: async ({ canvasElement }) => {
    const { page } = await openMenu(canvasElement);
    await userEvent.click(page.getByRole("menuitem", { name: "Switch workspace" }));
    const menu = await page.findByRole("menu", { name: "Workspaces" });
    await waitFor(() => expect(menu).toBeVisible());
    await waitFor(() => {
      const rect = menu.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
      expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
    });
    if (window.innerWidth < 640) await expect(page.getAllByRole("menu")).toHaveLength(1);
    await userEvent.keyboard("{End}");
    await expect(page.getByRole("menuitemradio", { name: "Workspace 24 with a deliberately long name" })).toHaveFocus();
    await userEvent.keyboard("{Escape}{Escape}");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};

let finishSwitch: (() => void) | undefined;
const pendingSelection = fn(() => new Promise<void>(resolve => { finishSwitch = resolve; }));
export const PendingSwitchBlocksOtherActions: Story = {
  args: { items: [{ label: "Settings", href: "/settings/profile", onSelect: fn() }], onSignOut: fn(), workspaces: { items: workspaceOptions, currentId: "lane", onSelect: pendingSelection } },
  play: async ({ canvasElement, args }) => {
    mocked(args.workspaces!.onSelect).mockImplementation(() => new Promise<void>(resolve => { finishSwitch = resolve; }));
    const { page, trigger } = await openMenu(canvasElement);
    await userEvent.click(page.getByRole("menuitem", { name: "Switch workspace" }));
    const studio = await page.findByRole("menuitemradio", { name: "Design Studio" });
    await waitFor(() => expect(studio).toBeVisible());
    await userEvent.click(studio);
    await expect(studio).toHaveAttribute("aria-busy", "true");
    await userEvent.keyboard("{Escape}{Tab}");
    await expect(studio).toHaveFocus();
    await expect(studio).toBeVisible();
    await userEvent.click(page.getByRole("menuitemradio", { name: "Lane" }));
    await expect(args.workspaces!.onSelect).toHaveBeenCalledTimes(1);
    if (window.innerWidth >= 640) {
      await userEvent.click(page.getByRole("menuitem", { name: "Sign out" }));
      await expect(args.onSignOut).not.toHaveBeenCalled();
      const settings = page.getByRole("menuitem", { name: "Settings" });
      const click = new MouseEvent("click", { bubbles: true, cancelable: true });
      settings.dispatchEvent(click);
      await expect(click.defaultPrevented).toBe(true);
      await expect(args.items![0].onSelect).not.toHaveBeenCalled();
    } else {
      await userEvent.click(page.getByRole("menuitem", { name: "Back" }));
      await expect(studio).toBeVisible();
    }
    finishSwitch?.();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
  },
};

function ControlledPendingFixture() {
  const [pendingId, setPendingId] = useState<string | null>(null);
  return <UserMenu user={user} showTheme={false} workspaces={{ items: workspaceOptions, currentId: "lane", pendingId,
    onSelect: async id => { setPendingId(id); await Promise.resolve(); },
  }} />;
}

export const PendingDocumentNavigationKeepsMenuLocked: Story = {
  render: () => <ControlledPendingFixture />,
  play: async ({ canvasElement }) => {
    const { page } = await openMenu(canvasElement);
    await userEvent.click(page.getByRole("menuitem", { name: "Switch workspace" }));
    const studio = await page.findByRole("menuitemradio", { name: "Design Studio" });
    await waitFor(() => expect(studio).toBeVisible());
    await userEvent.click(studio);
    await waitFor(() => expect(studio).toHaveAttribute("aria-busy", "true"));
    await userEvent.keyboard("{Escape}{Tab}");
    await expect(studio).toHaveFocus();
    await expect(studio).toBeVisible();
    await expect(page.getByRole("menu", { name: "Workspaces" })).toBeVisible();
    await waitFor(() => expect(getComputedStyle(page.getByRole("menu", { name: "Workspaces" })).opacity).toBe("1"));
  },
};
