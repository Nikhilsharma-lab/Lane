import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test";
import { useState } from "react";
import { WorkspaceSearchPane } from "@/components/shell/workspace-search-pane";
import type { WorkspaceSearchInput, WorkspaceSearchProject, WorkspaceSearchRequest, WorkspaceSearchResponse } from "@/lib/workspace-search";

// Illustrative, in-memory search fixtures. No server action or workspace data.
const requests: WorkspaceSearchRequest[] = Array.from({ length: 25 }, (_, index) => ({
  id: `search-request-${index + 1}`, title: `Website checkout issue ${index + 1}`,
  reframedProblem: index === 0 ? "Customers cannot find the delivery date before checkout" : null,
  status: index % 3 === 0 ? "open" : index % 3 === 1 ? "in_progress" : "done",
  projectId: "11111111-1111-4111-8111-111111111111", projectName: "Website",
  requestType: "improvement", createdAt: "2026-10-07T08:00:00.000Z",
}));
const projects: WorkspaceSearchProject[] = Array.from({ length: 22 }, (_, index) => ({ id: `search-project-${index + 1}`, name: `Website ${index + 1}`, description: "Public website and signup" }));

async function fixtureSearch(input: WorkspaceSearchInput): Promise<WorkspaceSearchResponse> {
  const query = input.query.trim();
  const requestMatches = requests.filter(item => `${item.title} ${item.reframedProblem ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const projectMatches = projects.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  function page<T>(items: T[], page = 0) { return { items: items.slice(page * 20, (page + 1) * 20), total: items.length, page, hasMore: (page + 1) * 20 < items.length }; }
  return { success: true, query, requests: page(requestMatches, input.requestsPage), projects: page(projectMatches, input.projectsPage) };
}

const meta = {
  title: "Patterns/Workspace search",
  component: WorkspaceSearchPane,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/", query: {} } } },
  decorators: [(Story) => <main style={{ display: "flex", height: "100dvh", overflow: "hidden" }}><Story /></main>],
  args: { active: true, onSearch: fn(fixtureSearch), onClose: fn(), onNavigate: fn() },
  afterEach: async ({ canvasElement }) => {
    // Accessibility measures the settled Arc result fill, not its entrance fade.
    const canvas = within(canvasElement);
    const result = canvas.queryByRole("region", { name: "Requests results" }) ?? canvas.queryByRole("region", { name: "Projects results" });
    if (result?.parentElement) await waitFor(() => expect(getComputedStyle(result.parentElement!).opacity).toBe("1"));
  },
} satisfies Meta<typeof WorkspaceSearchPane>;
export default meta;
type Story = StoryObj<typeof meta>;

async function submit(canvasElement: HTMLElement, query = "Website") {
  const input = within(canvasElement).getByRole("searchbox", { name: "Search workspace" });
  await userEvent.clear(input);
  await userEvent.type(input, `${query}{Enter}`);
  return input;
}

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("searchbox", { name: "Search workspace" })).toHaveFocus());
    await expect(canvas.getByRole("heading", { name: "Search your workspace" })).toBeVisible();
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
  },
};

export const SearchAndCategories: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("searchbox", { name: "Search workspace" });
    await userEvent.type(input, "Website");
    await expect(args.onSearch).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByRole("link", { name: /Website checkout issue 1 / })).toHaveAttribute("href", "/requests/search-request-1");
    await expect(canvas.getByRole("link", { name: /Website 1 Public/ })).toHaveAttribute("href", "/?project=search-project-1");
    const categories = within(canvas.getByRole("group", { name: "Search category" }));
    await userEvent.click(categories.getByRole("button", { name: /^Requests/ }));
    await expect(canvas.queryByRole("region", { name: "Projects results" })).not.toBeInTheDocument();
    await userEvent.keyboard("{ArrowRight}");
    await expect(categories.getByRole("button", { name: /^Projects/ })).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.queryByRole("region", { name: "Requests results" })).not.toBeInTheDocument();
    await expect(args.onSearch).toHaveBeenCalledTimes(1);
  },
};

export const ClearAndKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await submit(canvasElement);
    await canvas.findByRole("region", { name: "Requests results" });
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(input).toHaveValue(""); await expect(input).toHaveFocus();
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

export const NoResults: Story = {
  play: async ({ canvasElement }) => {
    await submit(canvasElement, "unmatched");
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("heading", { name: "No results found" })).toBeVisible();
    await expect(canvas.getByText("Try another word or check the spelling.")).toBeVisible();
  },
};

export const FailureAndRetry: Story = {
  play: async ({ canvasElement, args }) => {
    mocked(args.onSearch).mockResolvedValueOnce({ success: false, error: { code: "search_failed", message: "Search could not be completed. Try again." } });
    await submit(canvasElement);
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Retry search" }));
    await waitFor(() => expect(canvas.getByRole("region", { name: "Requests results" })).toBeVisible());
    await expect(args.onSearch).toHaveBeenLastCalledWith({ query: "Website", requestsPage: 0, projectsPage: 0 });
    await waitFor(() => expect(canvas.getByRole("searchbox")).toHaveFocus());
  },
};

export const IndependentPagination: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await submit(canvasElement);
    const scroll = canvas.getByRole("region", { name: "Search results" });
    await waitFor(() => expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight));
    await expect(getComputedStyle(scroll).overflowY).toBe("auto");
    await userEvent.click(await canvas.findByRole("button", { name: "Load more Requests" }));
    await expect(await canvas.findByRole("link", { name: /Website checkout issue 25 / })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole("link", { name: /Website checkout issue 21 / })).toHaveFocus());
    await expect(scroll.scrollTop).toBeGreaterThan(0);
    await expect(canvas.queryByRole("button", { name: "Load more Requests" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Load more Projects" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Load more Projects" }));
    await expect(await canvas.findByRole("link", { name: /Website 22 Public/ })).toBeVisible();
    await expect(args.onSearch).toHaveBeenLastCalledWith({ query: "Website", requestsPage: 1, projectsPage: 1 });
  },
};

export const LoadingAndStaleResponse: Story = {
  play: async ({ canvasElement, args }) => {
    let resolveFirst!: (result: WorkspaceSearchResponse) => void;
    mocked(args.onSearch).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    const canvas = within(canvasElement);
    await submit(canvasElement);
    await expect(canvas.getByRole("region", { name: "Search results" })).toHaveAttribute("aria-busy", "true");
    await submit(canvasElement, "unmatched");
    await canvas.findByRole("heading", { name: "No results found" });
    resolveFirst(await fixtureSearch({ query: "Website" }));
    await waitFor(() => expect(canvas.queryByRole("link")).not.toBeInTheDocument());
    await expect(canvas.getByRole("searchbox")).toHaveValue("unmatched");
  },
};

export const PaginationPreservesMovedFocus: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await submit(canvasElement);
    await canvas.findByRole("region", { name: "Requests results" });
    let resolvePage!: (result: WorkspaceSearchResponse) => void;
    mocked(args.onSearch).mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
    await userEvent.click(canvas.getByRole("button", { name: "Load more Requests" }));
    await userEvent.click(input);
    resolvePage(await fixtureSearch({ query: "Website", requestsPage: 1 }));
    await canvas.findByRole("link", { name: /Website checkout issue 25 / });
    await expect(input).toHaveFocus();
  },
};

function CloseReopenFixture(args: React.ComponentProps<typeof WorkspaceSearchPane>) {
  const [active, setActive] = useState(true);
  return <><button type="button" hidden={active} onClick={() => setActive(true)}>Open workspace search</button><WorkspaceSearchPane {...args} active={active} onClose={() => setActive(false)} /></>;
}
export const CloseAndReopen: Story = {
  render: args => <CloseReopenFixture {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await submit(canvasElement);
    await canvas.findByRole("region", { name: "Requests results" });
    await userEvent.click(canvas.getByRole("button", { name: "Close search" }));
    await expect(canvas.queryByRole("searchbox")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Open workspace search" }));
    await waitFor(() => expect(canvas.getByRole("searchbox")).toHaveFocus());
    await expect(canvas.getByRole("searchbox")).toHaveValue("Website");
    await expect(canvas.getByRole("region", { name: "Requests results" })).toBeVisible();
  },
};

export const CloseWhileLoading: Story = {
  render: args => <CloseReopenFixture {...args} />,
  play: async ({ canvasElement, args }) => {
    let resolveSearch!: (result: WorkspaceSearchResponse) => void;
    mocked(args.onSearch).mockImplementationOnce(() => new Promise(resolve => { resolveSearch = resolve; }));
    const canvas = within(canvasElement);
    await submit(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Close search" }));
    resolveSearch(await fixtureSearch({ query: "Website" }));
    await userEvent.click(canvas.getByRole("button", { name: "Open workspace search" }));
    await waitFor(() => expect(canvas.getByRole("searchbox")).toHaveFocus());
    await expect(canvas.queryByRole("link")).not.toBeInTheDocument();
    await expect(canvas.getByRole("region", { name: "Search results" })).toHaveAttribute("aria-busy", "false");
    await expect(canvas.getByRole("searchbox")).toHaveValue("Website");
  },
};

export const ResultNavigation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await submit(canvasElement);
    const link = await canvas.findByRole("link", { name: /Website checkout issue 1 / });
    const user = userEvent.setup();
    await user.keyboard("{Control>}"); await user.click(link); await user.keyboard("{/Control}");
    await expect(args.onNavigate).not.toHaveBeenCalled();
    await userEvent.click(link);
    await expect(args.onNavigate).toHaveBeenCalledWith("/requests/search-request-1");
  },
};

export const LongContent: Story = {
  args: { onSearch: fn(async input => ({ success: true, query: input.query,
    requests: { items: [{ ...requests[0], title: "Website checkout does not tell customers when their order will arrive at their selected delivery address when they choose an international shipping option", projectName: "The website for international business customers and their teams" }], total: 1, page: 0, hasMore: false },
    projects: { items: [{ ...projects[0], name: "Website for international business customers and their teams with a long Project name", description: "A Project description that has enough detail to wrap cleanly across several lines on a narrow phone display without hiding its meaning." }], total: 1, page: 0, hasMore: false },
  })) },
  play: async ({ canvasElement }) => {
    await submit(canvasElement);
    const results = await within(canvasElement).findByRole("region", { name: "Requests results" });
    await waitFor(() => expect(getComputedStyle(results.parentElement!).opacity).toBe("1"));
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
};

export const SavedRequestCode: Story = {
  args: { onSearch: fn(async input => ({ success: true, query: input.query,
    requests: { items: [{ ...requests[0], id: "44444444-4444-4444-8444-444444444444", requestNumber: 42 }], total: 1, page: 0, hasMore: false },
    projects: { items: [], total: 0, page: 0, hasMore: false },
  })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await submit(canvasElement, "LAN-42");
    const results = within(await canvas.findByRole("region", { name: "Requests results" }));
    const link = results.getByRole("link", { name: /Website checkout issue 1 .*LAN-42/ });
    await expect(within(link).getByText("LAN-42")).toBeVisible();
    await expect(within(link).getByText("Open")).toBeVisible();
    await expect(within(link).getByText("Website")).toBeVisible();
    await expect(link).toHaveAttribute("href", "/requests/44444444-4444-4444-8444-444444444444");
    await userEvent.click(link);
    await expect(args.onNavigate).toHaveBeenCalledWith("/requests/44444444-4444-4444-8444-444444444444");
  },
};
