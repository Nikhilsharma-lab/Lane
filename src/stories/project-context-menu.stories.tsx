import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { useState } from "react";
import Link from "next/link";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { ContextMenu } from "@/components/arc/context-menu/context-menu";
import { ProjectContextMenu } from "@/components/shell/project-context-menu";

const projectHref = "/?status=open&project=11111111-1111-4111-8111-111111111111";

function ProjectFixture({ href = projectHref, label = "Website" }: { href?: string; label?: string }) {
  const [visits, setVisits] = useState(0);
  const [open, setOpen] = useState(false);
  return <>
    <ProjectContextMenu href={href} label={label} onNavigate={() => setVisits(value => value + 1)} onOpenChange={setOpen}>
      <Link href={href} onClick={event => { event.preventDefault(); setVisits(value => value + 1); }}>{label}</Link>
    </ProjectContextMenu>
    <output aria-label="Navigation count">{visits}</output>
    <output aria-label="Menu state">{open ? "Open" : "Closed"}</output>
    <button type="button">Next control</button>
    <Link href="/settings/profile" onClick={event => event.preventDefault()}>Next page</Link>
  </>;
}

async function openProjectMenu(canvasElement: HTMLElement, label = "Website") {
  const link = within(canvasElement).getByRole("link", { name: label });
  link.focus();
  await userEvent.keyboard("{Shift>}{F10}{/Shift}");
  const page = within(canvasElement.ownerDocument.body);
  await waitFor(() => expect(page.getByRole("menuitem", { name: "Open" })).toHaveFocus());
  return page;
}

function replaceClipboard(writeText: (text: string) => Promise<void>) {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  return () => { if (original) Object.defineProperty(navigator, "clipboard", original); else Reflect.deleteProperty(navigator, "clipboard"); };
}

function NavigationFixture() {
  const [visits, setVisits] = useState(0);
  const navigationProps = { asChild: true, openOnClick: false };
  return <>
    <ContextMenu {...navigationProps} label="Website actions" items={[{ id: "open", label: "Open", onSelect: () => setVisits(value => value + 1) }, { id: "copy", label: "Copy link" }]}>
      <Link href="/?status=open&project=11111111-1111-4111-8111-111111111111" onClick={event => { event.preventDefault(); setVisits(value => value + 1); }}>Website</Link>
    </ContextMenu>
    <output aria-label="Navigation count">{visits}</output>
    <button type="button">Next control</button>
  </>;
}

const meta = {
  title: "Navigation/Project context menu",
  component: ContextMenu,
  args: { children: <span />, items: [] },
  render: () => <NavigationFixture />,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ContextMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

// Opening the menu on an ordinary click would intercept Project navigation.
export const OrdinaryClickKeepsNavigation: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("link", { name: "Website" }));
    await expect(canvas.getByLabelText("Navigation count")).toHaveTextContent("1");
    await expect(within(canvasElement.ownerDocument.body).queryByRole("menu")).not.toBeInTheDocument();
  },
};

// Restoring the wrapper instead of the link creates a dead keyboard position.
export const KeyboardReturnsToLink: Story = {
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: "Website" });
    const page = within(canvasElement.ownerDocument.body);
    link.focus();
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");
    await waitFor(() => expect(page.getByRole("menuitem", { name: "Open" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    await expect(link).toHaveFocus();
  },
};

export const ProjectOpenPreservesFilter: Story = {
  render: () => <ProjectFixture />,
  play: async ({ canvasElement }) => {
    getRouter().push.mockClear();
    const page = await openProjectMenu(canvasElement);
    await userEvent.click(page.getByRole("menuitem", { name: "Open" }));
    await expect(getRouter().push).toHaveBeenCalledWith(projectHref);
    await expect(within(canvasElement).getByLabelText("Navigation count")).toHaveTextContent("1");
    await expect(within(canvasElement).getByLabelText("Menu state")).toHaveTextContent("Closed");
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};

export const NoProjectOpensInNewTab: Story = {
  render: () => <ProjectFixture href="/?status=in_progress&project=none" label="No Project" />,
  play: async ({ canvasElement }) => {
    const originalOpen = window.open;
    const openWindow = fn<typeof window.open>(() => null);
    window.open = openWindow;
    getRouter().push.mockClear();
    try {
      const page = await openProjectMenu(canvasElement, "No Project");
      await userEvent.click(page.getByRole("menuitem", { name: "Open in new tab" }));
      await expect(openWindow).toHaveBeenCalledWith("/?status=in_progress&project=none", "_blank", "noopener,noreferrer");
      await expect(getRouter().push).not.toHaveBeenCalled();
      await expect(within(canvasElement).getByLabelText("Navigation count")).toHaveTextContent("0");
      await expect(within(canvasElement).getByRole("link", { name: "No Project" })).toHaveFocus();
      await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    } finally { window.open = originalOpen; }
  },
};

export const CopyLinkConfirmsInPlace: Story = {
  render: () => <ProjectFixture />,
  play: async ({ canvasElement }) => {
    const writeText = fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    const restoreClipboard = replaceClipboard(writeText);
    try {
      const page = await openProjectMenu(canvasElement);
      await userEvent.click(page.getByRole("menuitem", { name: "Copy link" }));
      await expect(writeText).toHaveBeenCalledWith(`${window.location.origin}${projectHref}`);
      await waitFor(() => expect(page.getByRole("menuitem", { name: "Link copied" })).toBeVisible());
      await expect(page.getByRole("menuitem", { name: "Link copied" })).toHaveFocus();
      await expect(page.getByRole("menu")).toBeVisible();
      await expect(within(canvasElement).getByLabelText("Navigation count")).toHaveTextContent("0");
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    } finally { restoreClipboard(); }
  },
};

export const ClipboardFailureCanRetry: Story = {
  render: () => <ProjectFixture />,
  play: async ({ canvasElement }) => {
    const writeText = fn<(text: string) => Promise<void>>().mockRejectedValueOnce(new Error("Permission denied")).mockResolvedValueOnce(undefined);
    const restoreClipboard = replaceClipboard(writeText);
    try {
      const page = await openProjectMenu(canvasElement);
      await userEvent.click(page.getByRole("menuitem", { name: "Copy link" }));
      const retry = await page.findByRole("menuitem", { name: "Copy failed. Try again" });
      await expect(retry).toBeEnabled();
      await userEvent.click(retry);
      await waitFor(() => expect(page.getByRole("menuitem", { name: "Link copied" })).toBeVisible());
      await expect(writeText).toHaveBeenCalledTimes(2);
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
    } finally { restoreClipboard(); }
  },
};

export const RightClickAndTabReturn: Story = {
  render: () => <ProjectFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("link", { name: "Website" });
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: window.innerWidth - 1, clientY: window.innerHeight - 1 });
    link.dispatchEvent(event);
    await expect(event.defaultPrevented).toBe(true);
    const page = within(canvasElement.ownerDocument.body);
    const menu = await page.findByRole("menu");
    await waitFor(() => expect(page.getByRole("menuitem", { name: "Open" })).toHaveFocus());
    await expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth - 7);
    await expect(menu.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight - 7);
    await userEvent.keyboard("{End}");
    await expect(page.getByRole("menuitem", { name: "Copy link" })).toHaveFocus();
    await userEvent.keyboard("{Tab}");
    await expect(link).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: "Next control" })).toHaveFocus();
    await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
  },
};

export const OutsideControlsKeepTheirFocus: Story = {
  render: () => <ProjectFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const target of [canvas.getByRole("button", { name: "Next control" }), canvas.getByRole("link", { name: "Next page" })]) {
      const page = await openProjectMenu(canvasElement);
      await userEvent.click(target);
      await waitFor(() => expect(page.queryByRole("menu")).not.toBeInTheDocument());
      await expect(target).toHaveFocus();
    }
  },
};
