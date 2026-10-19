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
  let requestMatches = requests.filter(item => `${item.title} ${item.reframedProblem ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  let projectMatches = projects.filter(item => item.name.toLowerCase().includes(query.toLowerCase()));
  const statuses = Object.fromEntries(["open", "in_progress", "done"].map(status => [status, requestMatches.filter(item => item.status === status).length]));
  const types = { improvement: requestMatches.length };
  if (input.statuses?.length) requestMatches = requestMatches.filter(item => input.statuses!.includes(item.status));
  if (input.types?.length) requestMatches = requestMatches.filter(item => input.types!.includes(item.requestType ?? "none"));
  if (input.statuses?.length || input.types?.length) projectMatches = [];
  if (input.sort === "title") requestMatches = [...requestMatches].sort((a,b) => a.title.localeCompare(b.title));
  function page<T>(items: T[], page = 0) { return { items: items.slice(page * 20, (page + 1) * 20), total: items.length, page, hasMore: (page + 1) * 20 < items.length }; }
  return { success: true, query, facets: { statuses, types }, requests: page(requestMatches, input.requestsPage), projects: page(projectMatches, input.projectsPage) };
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
    const result = canvas.queryByRole("listbox", { name: "Search matches" }) ?? canvas.queryByRole("listbox", { name: "Search matches" });
    if (result?.parentElement) await waitFor(() => expect(getComputedStyle(result.parentElement!).opacity).toBe("1"));
  },
} satisfies Meta<typeof WorkspaceSearchPane>;
export default meta;
type Story = StoryObj<typeof meta>;

async function submit(canvasElement: HTMLElement, query = "Website") {
  const input = within(canvasElement).getByRole("combobox", { name: "Search workspace" });
  await userEvent.clear(input);
  await userEvent.type(input, `${query}{Enter}`);
  return input;
}

export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("combobox", { name: "Search workspace" })).toHaveFocus());
    await expect(canvas.getByRole("heading", { name: "Find a Request or Project" })).toBeVisible();
    await waitFor(() => expect(canvas.queryByRole("link")).not.toBeInTheDocument());
  },
};

/** Selection must preview the saved match, and keyboard movement must update it. */
export const RichPreviewKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await submit(canvasElement);
    const list = await canvas.findByRole("listbox", { name: "Search matches" });
    await userEvent.click(input);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    const preview = await within(document.body).findByRole("article", { name: "Preview of Website checkout issue 2" });
    await expect(within(preview).getByRole("link", { name: "Open Request" })).toHaveAttribute("href", "/requests/search-request-2");
    await expect(list).toHaveAttribute("aria-activedescendant", expect.stringContaining("search-request-2"));
    const dialog = within(document.body).queryByRole("dialog", { name: "Result preview" });
    if (dialog) {
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(list).toHaveFocus());
    }
  },
};

export const RecentQueryReuse: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await submit(canvasElement);
    await canvas.findByRole("listbox", { name: "Search matches" });
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await userEvent.click(canvas.getByRole("option", { name: "Website" }));
    await expect(canvas.getByRole("combobox", { name: "Search workspace" })).toHaveValue("Website");
    await waitFor(() => expect(canvas.getByRole("listbox", { name: "Search matches" })).toBeVisible());
  },
};

/** Catches custom search shells that lose the shared input's inner gutter. */
export const SearchFieldInset: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("combobox", { name: "Search workspace" });
    const shell = input.parentElement!;
    const icon = shell.querySelector("svg")!;
    await expect(icon.getBoundingClientRect().left - shell.getBoundingClientRect().left).toBeGreaterThanOrEqual(12);
    await expect(parseFloat(getComputedStyle(shell).paddingInlineEnd)).toBe(12);
    await userEvent.type(input, "Website");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Clear search" }));
    await expect(input).toHaveValue("");
    await expect(input).toHaveFocus();
  },
};

/** Supabase's text-tone segmented control has no outer box or outlined selection. */
export const CategoryMaterial: Story = {
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole("group", { name: "Sort results" });
    await expect(getComputedStyle(group).borderTopWidth).toBe("0px");
    await expect(getComputedStyle(group).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    const selected = within(group).getByRole("button", { name: "Best match" });
    const selection = selected.querySelector('[aria-hidden="true"]')!;
    await expect(getComputedStyle(selection).borderTopWidth).toBe("0px");
    await expect(getComputedStyle(selection).boxShadow).toBe("none");
    await expect(selected.getBoundingClientRect().height).toBe(26);
    await userEvent.click(selected);
    await userEvent.keyboard("{End}");
    await expect(within(group).getByRole("button", { name: "A to Z" })).toHaveFocus();
    await expect(within(group).getByRole("button", { name: "A to Z" })).toHaveAttribute("aria-pressed", "true");
  },
};

async function openFilters(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const trigger = canvas.queryByRole("button", { name: /^Filters/ });
  if (trigger) await userEvent.click(trigger);
  return within(document.body);
}
async function closeFilters() {
  const button = within(document.body).queryByRole("button", { name: "Show results" });
  if (button) { await userEvent.click(button); await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Search filters" })).not.toBeInTheDocument()); }
}

export const SearchAndCategories: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await submit(canvasElement);
    await waitFor(() => expect(canvas.getByRole("option", { name: /Website checkout issue 1 / })).toBeVisible());
    const filters = await openFilters(canvasElement);
    await userEvent.click(filters.getByRole("checkbox", { name: "Requests" }));
    await closeFilters();
    await expect(canvas.queryByRole("option", { name: /Website 1 Project/ })).not.toBeInTheDocument();
    await openFilters(canvasElement);
    await userEvent.click(filters.getByRole("checkbox", { name: "Projects" }));
    await closeFilters();
    await expect(canvas.queryByRole("option", { name: /Website checkout issue/ })).not.toBeInTheDocument();
    await waitFor(() => expect(canvas.getByRole("option", { name: /Website 1 Project/ })).toBeVisible());
    await expect(args.onSearch).toHaveBeenCalledTimes(1);
  },
};

export const ClearAndKeyboard: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await submit(canvasElement);
    await canvas.findByRole("listbox", { name: "Search matches" });
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(input).toHaveValue(""); await expect(input).toHaveFocus();
    await waitFor(() => expect(canvas.queryByRole("link")).not.toBeInTheDocument());
    await userEvent.keyboard("{Escape}{Escape}");
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
    await waitFor(() => expect(canvas.getByRole("listbox", { name: "Search matches" })).toBeVisible());
    await expect(args.onSearch).toHaveBeenLastCalledWith({ query: "Website", sort: "relevance", requestsPage: 0, projectsPage: 0 }, expect.any(AbortSignal));
    await waitFor(() => expect(canvas.getByRole("combobox")).toHaveFocus());
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
    await expect(await canvas.findByRole("option", { name: /Website checkout issue 25 / })).toBeVisible();
    await waitFor(() => expect(canvas.getByRole("option", { name: /Website checkout issue 21 / })).toHaveFocus());
    await expect(scroll.scrollTop).toBeGreaterThan(0);
    await expect(canvas.queryByRole("button", { name: "Load more Requests" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Load more Projects" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Load more Projects" }));
    await expect(await canvas.findByRole("option", { name: /Website 22 Project Public/ })).toBeVisible();
    await expect(args.onSearch).toHaveBeenLastCalledWith({ query: "Website", sort: "relevance", requestsPage: 1, projectsPage: 1 }, expect.any(AbortSignal));
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
    await expect(canvas.getByRole("combobox")).toHaveValue("unmatched");
  },
};

export const PaginationPreservesMovedFocus: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await submit(canvasElement);
    await canvas.findByRole("listbox", { name: "Search matches" });
    let resolvePage!: (result: WorkspaceSearchResponse) => void;
    mocked(args.onSearch).mockImplementationOnce(() => new Promise(resolve => { resolvePage = resolve; }));
    await userEvent.click(canvas.getByRole("button", { name: "Load more Requests" }));
    await userEvent.click(input);
    resolvePage(await fixtureSearch({ query: "Website", sort: "relevance", requestsPage: 1 }));
    await canvas.findByRole("option", { name: /Website checkout issue 25 / });
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
    await canvas.findByRole("listbox", { name: "Search matches" });
    await userEvent.click(canvas.getByRole("button", { name: "Close search" }));
    await expect(canvas.queryByRole("combobox")).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Open workspace search" }));
    await waitFor(() => expect(canvas.getByRole("combobox")).toHaveFocus());
    await expect(canvas.getByRole("combobox")).toHaveValue("Website");
    await expect(canvas.getByRole("listbox", { name: "Search matches" })).toBeVisible();
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
    await waitFor(() => expect(canvas.getByRole("combobox")).toHaveFocus());
    await waitFor(() => expect(canvas.queryByRole("link")).not.toBeInTheDocument());
    await expect(canvas.getByRole("region", { name: "Search results" })).toHaveAttribute("aria-busy", "false");
    await expect(canvas.getByRole("combobox")).toHaveValue("Website");
  },
};

export const ResultNavigation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await submit(canvasElement);
    await userEvent.click(await canvas.findByRole("option", { name: /Website checkout issue 1 / }));
    const link = await within(document.body).findByRole("link", { name: "Open Request" });
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
    const results = await within(canvasElement).findByRole("listbox", { name: "Search matches" });
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
    const results = within(await canvas.findByRole("listbox", { name: "Search matches" }));
    const link = results.getByRole("option", { name: /Website checkout issue 1 .*LAN-42/ });
    // Results fade in from opacity 0, so wait for the highlighted code to settle before reading visibility.
    await waitFor(() => expect(within(link).getByText("LAN-42")).toBeVisible());
    await expect(link).toHaveTextContent("Open");
    await expect(link).toHaveTextContent("Website");
    await userEvent.click(link);
    const open = await within(document.body).findByRole("link", { name: "Open Request" });
    await expect(open).toHaveAttribute("href", "/requests/44444444-4444-4444-8444-444444444444");
    await userEvent.click(open);
    await expect(args.onNavigate).toHaveBeenCalledWith("/requests/44444444-4444-4444-8444-444444444444");
  },
};

export const FiltersAndDates: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(document.body);
    await submit(canvasElement);
    await canvas.findByRole("listbox", { name: "Search matches" });
    await openFilters(canvasElement);
    await userEvent.click(page.getByRole("checkbox", { name: "Done" }));
    await closeFilters();
    await waitFor(() => expect(canvas.getAllByRole("option")).toHaveLength(8));
    await expect(canvas.queryByRole("button", { name: "Load more Requests" })).not.toBeInTheDocument();
    await openFilters(canvasElement);
    const dateTrigger = page.getByRole("button", { name: "Any time" });
    await userEvent.click(dateTrigger);
    const dates = within(await page.findByRole("dialog", { name: "Created date" }));
    // The calendar loads on demand; the first open in a session can show its skeleton for a moment.
    await userEvent.click(await dates.findByRole("button", { name: "Last 7 days" }));
    await userEvent.click(dates.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Created date" })).not.toBeInTheDocument());
    await waitFor(() => expect(dateTrigger).toHaveFocus());
    await closeFilters();
    await expect(args.onSearch).toHaveBeenLastCalledWith(expect.objectContaining({ statuses: ["done"], createdFrom: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), createdTo: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), requestsPage: 0, projectsPage: 0 }), expect.any(AbortSignal));
    await openFilters(canvasElement);
    await userEvent.click(page.queryByRole("button", { name: "Clear filters" }) ?? within(canvas.getByRole("complementary", { name: "Search filters" })).getByRole("button", { name: "Clear all" }));
    await closeFilters();
    await waitFor(() => expect(canvas.getAllByRole("option")).toHaveLength(40));
  },
};
