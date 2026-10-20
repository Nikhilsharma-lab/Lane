import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fireEvent, fn, mocked, userEvent, waitFor, within } from "storybook/test";
import { getRouter } from "@storybook/nextjs-vite/navigation.mock";
import { useState } from "react";
import { WorkspaceSearchPane } from "@/components/shell/workspace-search-pane";
import { RequestsOverview } from "@/app/(app)/requests-overview";
import { RequestListViewProvider } from "@/components/requests/list-view-state";
import type { OverviewRequest } from "@/lib/request-overview";
import { localDayRange, type WorkspaceSearchInput, type WorkspaceSearchProject, type WorkspaceSearchRequest, type WorkspaceSearchResponse } from "@/lib/workspace-search";
import { WorkspaceSidebarFixture } from "./helpers/workspace-sidebar-fixture";

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
  if (input.createdSince && input.createdBefore) requestMatches = requestMatches.filter(item => item.createdAt >= input.createdSince! && item.createdAt < input.createdBefore!);
  if (input.sort === "title") requestMatches = [...requestMatches].sort((a,b) => a.title.localeCompare(b.title));
  function page<T>(items: T[], page = 0) { return { items: items.slice(page * 20, (page + 1) * 20), total: items.length, page, hasMore: (page + 1) * 20 < items.length }; }
  return { success: true, query, facets: { statuses, types }, requests: page(requestMatches, input.requestsPage), projects: page(projectMatches, input.projectsPage) };
}

const meta = {
  title: "Patterns/Workspace search",
  component: WorkspaceSearchPane,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/", query: {} } } },
  // Shell stories mount the production sidebar, which has its own main landmark.
  decorators: [(Story, context) => context.parameters.fullShell ? <Story /> : <main style={{ display: "flex", height: "100dvh", overflow: "hidden" }}><Story /></main>],
  args: { active: true, onSearch: fn(fixtureSearch), onClose: fn(), onNavigate: fn(), onOpen: fn() },
  beforeEach: () => { getRouter().push.mockClear(); },
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
    await waitFor(() => expect(canvas.getByRole("option", { name: "Website checkout issue 1" })).toBeVisible());
    const filters = await openFilters(canvasElement);
    // Plan item 2.8: "Search in" is one choice, so it is a radio group with each category's count.
    const searchIn = filters.getByRole("group", { name: "Search in" });
    await expect(within(searchIn).getAllByRole("radio")).toHaveLength(3);
    await expect(within(searchIn).getByRole("radio", { name: /^All/ })).toBeChecked();
    await expect(within(searchIn).getByRole("radio", { name: /^Requests/ })).toHaveAccessibleName(/25 results/);
    await userEvent.click(within(searchIn).getByRole("radio", { name: /^Requests/ }));
    await expect(within(searchIn).getByRole("radio", { name: /^Requests/ })).toBeChecked();
    await closeFilters();
    await expect(canvas.queryByRole("option", { name: "Website 1, Project" })).not.toBeInTheDocument();
    const again = (await openFilters(canvasElement)).getByRole("group", { name: "Search in" });
    await userEvent.click(within(again).getByRole("radio", { name: /^Projects/ }));
    await expect(within(again).getByRole("radio", { name: /^Requests/ })).not.toBeChecked();
    await closeFilters();
    await expect(canvas.queryByRole("option", { name: /Website checkout issue/ })).not.toBeInTheDocument();
    await waitFor(() => expect(canvas.getByRole("option", { name: "Website 1, Project" })).toBeVisible());
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
    await expect(await canvas.findByRole("option", { name: "Website checkout issue 25" })).toBeVisible();
    // The focused button left with the last page: the list takes focus, on the first new result (one focus pattern: aria-activedescendant).
    const list = canvas.getByRole("listbox", { name: "Search matches" });
    await waitFor(() => expect(list).toHaveFocus());
    await expect(list).toHaveAttribute("aria-activedescendant", canvas.getByRole("option", { name: "Website checkout issue 21" }).id);
    await expect(canvas.getByRole("option", { name: "Website checkout issue 21" })).toHaveAttribute("aria-selected", "true");
    for (const option of canvas.getAllByRole("option")) await expect(option).not.toHaveAttribute("tabindex");
    await expect(scroll.scrollTop).toBeGreaterThan(0);
    await expect(canvas.queryByRole("button", { name: "Load more Requests" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Load more Projects" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Load more Projects" }));
    await expect(await canvas.findByRole("option", { name: "Website 22, Project" })).toBeVisible();
    await expect(args.onSearch).toHaveBeenLastCalledWith({ query: "Website", sort: "relevance", requestsPage: 1, projectsPage: 1 }, expect.any(AbortSignal));
  },
};

export const LoadingAndStaleResponse: Story = {
  play: async ({ canvasElement, args }) => {
    let resolveFirst!: (result: WorkspaceSearchResponse) => void;
    mocked(args.onSearch).mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    const canvas = within(canvasElement);
    await submit(canvasElement);
    // Nothing to keep yet: the first search shows its skeleton.
    await expect(canvas.getAllByRole("status", { name: "Searching workspace" }).length).toBeGreaterThan(0);
    await expect(canvas.getByText("Searching for Website")).toBeInTheDocument();
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
    await canvas.findByRole("option", { name: "Website checkout issue 25" });
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
    await expect(canvasElement.querySelector('[aria-busy="true"]')).toBeNull();
    await expect(canvas.getByRole("combobox")).toHaveValue("Website");
  },
};

export const ResultNavigation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await submit(canvasElement);
    await userEvent.click(await canvas.findByRole("option", { name: "Website checkout issue 1" }));
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
    const input = canvas.getByRole("combobox", { name: "Search workspace" });
    // Typed, not entered: the result shows with its code, named by title and code.
    await userEvent.type(input, "LAN-42");
    const results = within(await canvas.findByRole("listbox", { name: "Search matches" }));
    const result = await results.findByRole("option", { name: "Website checkout issue 1, LAN-42" });
    // Results fade in from opacity 0, so wait for the highlighted code to settle before reading visibility.
    await waitFor(() => expect(within(result).getByText("LAN-42")).toBeVisible());
    await expect(result).toHaveTextContent("Open");
    await expect(result).toHaveTextContent("Website");
    await userEvent.click(result);
    const open = await within(document.body).findByRole("link", { name: "Open Request" });
    await expect(open).toHaveAttribute("href", "/requests/44444444-4444-4444-8444-444444444444");
    await userEvent.click(open);
    await expect(args.onNavigate).toHaveBeenCalledWith("/requests/44444444-4444-4444-8444-444444444444");
    // Decision 1 (2026-10-20): Enter on the exact code opens the Request directly.
    const dialog = within(document.body).queryByRole("dialog", { name: "Result preview" });
    if (dialog) { await userEvent.keyboard("{Escape}"); await waitFor(() => expect(within(document.body).queryByRole("dialog", { name: "Result preview" })).not.toBeInTheDocument()); }
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");
    await expect(args.onOpen).toHaveBeenCalledTimes(1);
    await expect(args.onOpen).toHaveBeenCalledWith("/requests/44444444-4444-4444-8444-444444444444");
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
    await expect(args.onSearch).toHaveBeenLastCalledWith(expect.objectContaining({ statuses: ["done"], createdSince: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/), createdBefore: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/), requestsPage: 0, projectsPage: 0 }), expect.any(AbortSignal));
    await openFilters(canvasElement);
    await userEvent.click(page.queryByRole("button", { name: "Clear filters" }) ?? within(canvas.getByRole("complementary", { name: "Search filters" })).getByRole("button", { name: "Clear all" }));
    await closeFilters();
    await waitFor(() => expect(canvas.getAllByRole("option")).toHaveLength(40));
  },
};

// ---------------------------------------------------------------------------
// Plan item 2.8 (decisions of 2026-10-20)

/** A held search: resolves only when the story releases it, so a story can look at the list while a request is in flight. */
function holdSearches(onSearch: ReturnType<typeof fn<typeof fixtureSearch>>, answer: (input: WorkspaceSearchInput) => Promise<WorkspaceSearchResponse> = fixtureSearch) {
  const held: (() => Promise<void>)[] = [];
  mocked(onSearch).mockImplementation(input => new Promise(resolve => { held.push(async () => resolve(await answer(input))); }));
  return { release: async () => { const pending = held.splice(0); for (const next of pending) await next(); }, get count() { return held.length; } };
}

/** Typing keeps the last results on screen, marks only the list busy while a request is in flight, and never shows a skeleton or empty state between keystrokes. */
export const KeptResultsWhileTyping: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = await submit(canvasElement, "Website");
    const list = await canvas.findByRole("listbox", { name: "Search matches" });
    await waitFor(() => expect(list).toHaveAttribute("aria-busy", "false"));
    const first = canvas.getByRole("option", { name: "Website checkout issue 1" });
    const hold = holdSearches(args.onSearch as never);
    await userEvent.type(input, " checkout");
    // The debounced request is in flight: the same rows stay, the list says it is updating.
    await waitFor(() => expect(hold.count).toBeGreaterThan(0));
    await expect(list).toHaveAttribute("aria-busy", "true");
    await expect(canvas.getByRole("option", { name: "Website checkout issue 1" })).toBe(first);
    await expect(canvas.queryByRole("status", { name: "Searching workspace" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("heading", { name: "No results found" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("region", { name: "Search results" })).not.toHaveAttribute("aria-busy");
    await hold.release();
    await waitFor(() => expect(list).toHaveAttribute("aria-busy", "false"));
    await expect(args.onSearch).toHaveBeenLastCalledWith(expect.objectContaining({ query: "Website checkout" }), expect.any(AbortSignal));
    await expect(canvas.getByText("25 results for Website checkout")).toBeInTheDocument();
    // Every request a newer keystroke replaced was aborted.
    for (const call of mocked(args.onSearch).mock.calls.slice(1, -1)) await expect(((call as unknown[])[1] as AbortSignal).aborted).toBe(true);
  },
};

const loaded: WorkspaceSearchRequest[] = [
  { id: "loaded-older", requestNumber: 7, title: "Checkout totals hide delivery", reframedProblem: null, status: "open", projectId: null, projectName: null, requestType: "bug", createdAt: "2026-09-01T09:00:00.000Z" },
  { id: "loaded-newer", requestNumber: 12, title: "Checkout asks for a phone number twice", reframedProblem: null, status: "in_progress", projectId: null, projectName: null, requestType: null, createdAt: "2026-10-10T09:00:00.000Z" },
  { id: "loaded-code", requestNumber: 3, title: "Signup loses the workspace name", reframedProblem: "People abandon checkout after signup", status: "done", projectId: null, projectName: null, requestType: null, createdAt: "2026-10-12T09:00:00.000Z" },
];
const serverOnly: WorkspaceSearchRequest = { id: "server-only", requestNumber: 31, title: "Older checkout copy", reframedProblem: null, status: "done", projectId: null, projectName: null, requestType: null, createdAt: "2026-06-01T09:00:00.000Z" };

/** Matches among the loaded Requests show before the server answers; the server's rows then join below them without moving the rows already shown. */
export const LocalMatchesFirst: Story = {
  args: { getLoaded: () => ({ requests: loaded, projects: [{ id: "project-checkout", name: "Checkout", description: null }] }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const hold = holdSearches(args.onSearch as never, async input => ({ success: true, query: input.query.trim(),
      // The server's own order differs from the shown one, and it has one more Request.
      requests: { items: [serverOnly, loaded[1], loaded[0]], total: 3, page: 0, hasMore: false },
      projects: { items: [{ id: "project-checkout", name: "Checkout", description: null }], total: 1, page: 0, hasMore: false } }));
    const input = canvas.getByRole("combobox", { name: "Search workspace" });
    await userEvent.type(input, "checkout");
    const list = await canvas.findByRole("listbox", { name: "Search matches" });
    const names = () => within(canvas.getByRole("listbox", { name: "Search matches" })).getAllByRole("option").map(option => option.getAttribute("aria-label"));
    // Before any answer: Best match order among the loaded rows (title words, newest first, then the reframed problem), and the Project.
    await expect(names()).toEqual(["Checkout asks for a phone number twice, LAN-12", "Checkout totals hide delivery, LAN-7", "Signup loses the workspace name, LAN-3", "Checkout, Project"]);
    await waitFor(() => expect(hold.count).toBe(1));
    await expect(list).toHaveAttribute("aria-busy", "true");
    const shown = within(list).getAllByRole("option").slice(0, 2);
    await hold.release();
    await waitFor(() => expect(list).toHaveAttribute("aria-busy", "false"));
    await expect(names()).toEqual(["Checkout asks for a phone number twice, LAN-12", "Checkout totals hide delivery, LAN-7", "Older checkout copy, LAN-31", "Checkout, Project"]);
    await expect(within(list).getAllByRole("option").slice(0, 2)).toEqual(shown);
    // A keystroke nothing loaded matches keeps these rows (no empty state) while its request is in flight.
    const before = names();
    await userEvent.type(input, "x");
    await waitFor(() => expect(hold.count).toBe(1));
    await expect(canvas.getByRole("listbox", { name: "Search matches" })).toBe(list);
    await expect(list).toHaveAttribute("aria-busy", "true");
    await expect(names()).toEqual(before);
    await expect(canvas.queryByRole("heading", { name: /No results found|Find a Request or Project/ })).not.toBeInTheDocument();
    // An exact saved code ranks first, case-insensitively.
    await userEvent.clear(input);
    await userEvent.type(input, "lan-3");
    await waitFor(() => expect(names()[0]).toBe("Signup loses the workspace name, LAN-3"));
    await expect(names()).toHaveLength(1);
  },
};

/** Enter on an exact saved code of a loaded Request opens it at once; with no loaded match, it opens when the server finds the code. */
function codeFixture(input: WorkspaceSearchInput): WorkspaceSearchResponse {
  const query = input.query.trim();
  const items = [...loaded, serverOnly].filter(item => `LAN-${item.requestNumber}` === query.toUpperCase() || item.title.toLowerCase().includes(query.toLowerCase()));
  return { success: true, query, requests: { items, total: items.length, page: 0, hasMore: false }, projects: { items: [], total: 0, page: 0, hasMore: false } };
}
export const ExactCodeEnter: Story = {
  // Only LAN-7, LAN-12 and LAN-3 are loaded; LAN-31 exists on the server only.
  args: { getLoaded: () => ({ requests: loaded, projects: [] }), onSearch: fn(async (input: WorkspaceSearchInput) => codeFixture(input)) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: "Search workspace" });
    await userEvent.type(input, "lan-12");
    // An Enter that commits an IME composition opens nothing: Chrome's isComposing, and Safari's keyCode 229 after compositionend.
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
    await expect(args.onOpen).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await expect(args.onOpen).toHaveBeenCalledWith("/requests/loaded-newer");
    await userEvent.clear(input);
    await userEvent.type(input, "LAN-31{Enter}");
    await waitFor(() => expect(args.onOpen).toHaveBeenLastCalledWith("/requests/server-only"));
    // A code nobody has searches and stays: the empty state, no navigation.
    await userEvent.clear(input);
    await userEvent.type(input, "LAN-99{Enter}");
    await expect(await canvas.findByRole("heading", { name: "No results found" })).toBeVisible();
    await expect(args.onOpen).toHaveBeenCalledTimes(2);
    // Enter on any other query previews nothing and opens nothing.
    await userEvent.clear(input);
    await userEvent.type(input, "checkout{Enter}");
    await canvas.findByRole("option", { name: "Checkout asks for a phone number twice, LAN-12" });
    await expect(args.onOpen).toHaveBeenCalledTimes(2);
  },
};

const createdIso = `${new Date().getFullYear()}-03-05T21:15:00.000Z`;
/** Rows show the day on the viewer's calendar and the preview the viewer's date and time, never a UTC day. */
export const LocalDates: Story = {
  args: { onSearch: fn(async (input: WorkspaceSearchInput): Promise<WorkspaceSearchResponse> => ({ success: true, query: input.query.trim(),
    requests: { items: [{ ...requests[0], createdAt: createdIso }], total: 1, page: 0, hasMore: false }, projects: { items: [], total: 0, page: 0, hasMore: false } })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await submit(canvasElement, "Website");
    const row = await canvas.findByRole("option", { name: "Website checkout issue 1" });
    const time = row.querySelector("time")!;
    await expect(time).toHaveAttribute("datetime", createdIso);
    await expect(time).toHaveTextContent(new Date(createdIso).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    await expect(time.textContent).not.toMatch(/\d:\d\d/);
    await userEvent.click(row);
    const preview = await within(document.body).findByRole("article", { name: "Preview of Website checkout issue 1" });
    await expect(within(preview).getByText(new Date(createdIso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))).toBeVisible();
  },
};

// Today on this machine's calendar, as the date picker's "Today" preset chooses it, and that day's bounds in India.
const pad = (value: number) => String(value).padStart(2, "0");
const today = new Date();
const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
const ist = localDayRange(todayKey, todayKey, "Asia/Kolkata");
const istRequests: WorkspaceSearchRequest[] = [
  { ...requests[0], id: "ist-first-minute", title: "Website checkout after midnight in India", createdAt: new Date(Date.parse(ist.createdSince) + 30 * 60_000).toISOString() },
  { ...requests[0], id: "ist-day-before", title: "Website checkout just before midnight in India", createdAt: new Date(Date.parse(ist.createdSince) - 60_000).toISOString() },
];

/** The created-date filter sends the viewer's day boundaries: in India a day starts at 18:30 UTC the evening before. */
export const IstDayBoundary: Story = {
  args: { timeZone: "Asia/Kolkata", onSearch: fn(async (input: WorkspaceSearchInput): Promise<WorkspaceSearchResponse> => {
    const items = istRequests.filter(item => !input.createdSince || (item.createdAt >= input.createdSince && item.createdAt < input.createdBefore!));
    return { success: true, query: input.query.trim(), requests: { items, total: items.length, page: 0, hasMore: false }, projects: { items: [], total: 0, page: 0, hasMore: false } };
  }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const page = within(document.body);
    await submit(canvasElement, "Website");
    await canvas.findByRole("option", { name: "Website checkout just before midnight in India" });
    await openFilters(canvasElement);
    await userEvent.click(page.getByRole("button", { name: "Any time" }));
    const dates = within(await page.findByRole("dialog", { name: "Created date" }));
    await userEvent.click(await dates.findByRole("button", { name: "Today" }));
    await userEvent.click(dates.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Created date" })).not.toBeInTheDocument());
    await closeFilters();
    await expect(args.onSearch).toHaveBeenLastCalledWith(expect.objectContaining(ist), expect.any(AbortSignal));
    await expect(ist.createdSince).toMatch(/T18:30:00\.000Z$/);
    await expect(Date.parse(ist.createdBefore) - Date.parse(ist.createdSince)).toBe(86_400_000);
    await waitFor(() => expect(canvas.queryByRole("option", { name: "Website checkout just before midnight in India" })).not.toBeInTheDocument());
    const row = canvas.getByRole("option", { name: "Website checkout after midnight in India" });
    // The row's day is India's day.
    await expect(row.querySelector("time")).toHaveTextContent(new Date(istRequests[0].createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "Asia/Kolkata" }));
  },
};

// The production shell: sidebar, Requests list (which publishes its loaded rows) and the search pane.
const shellRequests: OverviewRequest[] = loaded.map((request, index) => ({ ...request, creatorName: "Alex Morgan", assigneeName: null, createdAt: request.createdAt, priority: index === 0 ? "high" : "none" }));
function ShellFixture() {
  return <RequestListViewProvider>
    <WorkspaceSidebarFixture pathname="/" requests={shellRequests}>
      <RequestsOverview requests={shellRequests} isGuest={false} />
    </WorkspaceSidebarFixture>
  </RequestListViewProvider>;
}

/** Keyboard only: / opens search, typing finds, arrows move, Enter previews, Cmd or Ctrl+Enter opens, Esc closes and returns focus. */
export const KeyboardOnly: Story = {
  parameters: { fullShell: true },
  render: () => <ShellFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(document.body);
    await canvas.findByRole("treegrid", { name: "Requests" });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("/");
    const input = await canvas.findByRole("combobox", { name: "Search workspace" });
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.keyboard("checkout");
    const list = await canvas.findByRole("listbox", { name: "Search matches" });
    await waitFor(() => expect(list).toHaveAttribute("aria-busy", "false"));
    await userEvent.keyboard("{ArrowDown}");
    await expect(list).toHaveFocus();
    const options = within(list).getAllByRole("option");
    await expect(list).toHaveAttribute("aria-activedescendant", options[0].id);
    await userEvent.keyboard("{ArrowDown}");
    await expect(list).toHaveAttribute("aria-activedescendant", options[1].id);
    await userEvent.keyboard("{Enter}");
    await expect(await page.findByRole("article", { name: `Preview of ${loaded[0].title}` })).toBeInTheDocument();
    await expect(getRouter().push).not.toHaveBeenCalled();
    if (page.queryByRole("dialog", { name: "Result preview" })) {
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(page.queryByRole("dialog", { name: "Result preview" })).not.toBeInTheDocument());
      await waitFor(() => expect(list).toHaveFocus());
    }
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect(getRouter().push).toHaveBeenCalledWith(`/requests/${loaded[0].id}`);
    await waitFor(() => expect(canvas.queryByRole("combobox", { name: "Search workspace" })).not.toBeInTheDocument());
    // Again with / and close with Esc: focus returns to the control that opens search.
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("/");
    await waitFor(() => expect(canvas.getByRole("combobox", { name: "Search workspace" })).toHaveFocus());
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.queryByRole("combobox", { name: "Search workspace" })).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement).toHaveAccessibleName(/^(Search workspace|Expand sidebar)$/));
  },
};

/** In the shell, Enter on a loaded Request's exact code opens it with no server round trip. */
export const ExactCodeEnterInShell: Story = {
  parameters: { fullShell: true },
  render: () => <ShellFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("treegrid", { name: "Requests" });
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.keyboard("/");
    const input = await canvas.findByRole("combobox", { name: "Search workspace" });
    await waitFor(() => expect(input).toHaveFocus());
    await userEvent.keyboard("Lan-3{Enter}");
    await expect(getRouter().push).toHaveBeenCalledWith("/requests/loaded-code");
    await waitFor(() => expect(canvas.queryByRole("combobox", { name: "Search workspace" })).not.toBeInTheDocument());
  },
};
