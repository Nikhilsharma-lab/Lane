import { createElement, type ReactNode } from "react";
import { AppProviders } from "@/test/app-providers";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ useOrganization: () => ({ isLoaded: false }), useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  // The list view the layout reads from the URL: In progress in the Website Project.
  useSearchParams: () => new URLSearchParams({ status: "in_progress", project: "11111111-1111-4111-8111-111111111111" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { SidebarView } from "./sidebar-view";
import { PageStrip } from "./page-strip";

// Plan item 2.0: the shell no longer renders a topbar; each page's strip shows
// the shell's trail followed by its own name.
const websiteId = "11111111-1111-4111-8111-111111111111";
const render = (pathname: string, children?: ReactNode) => renderToStaticMarkup(createElement(AppProviders, null, createElement(SidebarView, {
  workspaceName: "Lane Studio", fullName: "Test Member", email: "member@example.test", role: "member",
  pathname,
  projects: [{ id: websiteId, name: "Website", description: null }], notifications: null,
}, children)));
const crumbs = (html: string) => {
  const nav = /<nav aria-label="Breadcrumb"[^>]*>[\s\S]*?<\/nav>/.exec(html)?.[0];
  if (!nav) return null;
  return [...nav.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(([, item]) => {
    const link = /<a\b[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/.exec(item);
    return link ? [link[2], link[1].replaceAll("&amp;", "&")] : [item.replace(/<[^>]+>/g, "")];
  });
};

describe("SidebarView frame", () => {
  it.each(["/requests/x", "/intake", "/settings/profile", "/"])("renders no topbar and no crumbs of its own at %s", (pathname) => {
    const html = render(pathname);
    expect(html).not.toContain("<header");
    expect(html).not.toContain('aria-label="Breadcrumb"');
  });

  it.each([
    ["/requests/x", "Request detail", [["Lane Studio", "/"], ["Website", `/?status=in_progress&project=${websiteId}`], ["Request detail"]]],
    ["/intake", "New Request", [["Lane Studio", "/"], ["New Request"]]],
    ["/settings/members", "Members", [["Lane Studio", "/"], ["Settings", "/settings/profile"], ["Members"]]],
  ])("gives the page strip at %s the shell's trail", (pathname, title, expected) => {
    const html = render(pathname, createElement(PageStrip, { title }));
    expect(html.match(/data-slot="page-strip"/g)).toHaveLength(1);
    expect(crumbs(html)).toEqual(expected);
  });

  it("shows the list's title alone on /", () => {
    const html = render("/", createElement(PageStrip, { title: "Requests", heading: true }));
    expect(crumbs(html)).toBeNull();
    expect(html).toMatch(/<h1\b[^>]*>Requests<\/h1>/);
  });

  // #106: Settings renders only the page, so the palette's ⌘K is mounted in both branches.
  it.each(["/", "/requests/x", "/settings/profile", "/settings/members"])("mounts the command palette once at %s", (pathname) => {
    const html = renderToStaticMarkup(createElement(AppProviders, null, createElement(SidebarView, {
      workspaceName: "Lane Studio", fullName: "Test Member", email: "member@example.test", role: "member", pathname, notifications: null,
      palette: createElement("span", { "data-test-palette": "" }),
    })));
    expect(html.match(/data-test-palette/g)).toHaveLength(1);
  });
});

// #210: a Viewer files nothing, so the sidebar has no New Request control for them.
describe("SidebarView for a Viewer", () => {
  const as = (role: string) => renderToStaticMarkup(createElement(AppProviders, null, createElement(SidebarView, {
    workspaceName: "Lane Studio", fullName: "Test Viewer", email: "viewer@example.test", role, pathname: "/", projects: [], notifications: null,
  })));
  it("leaves out New Request, and keeps it for a Member", () => {
    expect(as("member")).toContain('aria-label="New Request"');
    expect(as("viewer")).not.toContain('aria-label="New Request"');
    expect(as("viewer")).toContain("All Requests");
  });
});

// #219: a person's saved views sit in the navigation, each opening the Requests list with its filters.
describe("SidebarView saved views", () => {
  const withViews = (savedViews: { id: string; name: string; filters: { status: "open" | "all"; project: string } }[]) => renderToStaticMarkup(createElement(AppProviders, null, createElement(SidebarView, {
    workspaceName: "Lane Studio", fullName: "Test Member", email: "member@example.test", role: "viewer", pathname: "/inbox", projects: [], notifications: null, savedViews,
  })));
  const group = (html: string) => /<section[^>]*aria-label="Your views"[^>]*>[\s\S]*?<\/section>/.exec(html)?.[0] ?? null;

  it("lists each view by name, linking to the list with its filters", () => {
    const html = group(withViews([
      { id: "v1", name: "Open work", filters: { status: "open", project: "all" } },
      { id: "v2", name: "Website", filters: { status: "all", project: websiteId } },
    ]));
    expect(html).not.toBeNull();
    const links = [...html!.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/g)].map(([link, href]) => [link.replace(/<[^>]+>/g, ""), href.replaceAll("&amp;", "&")]);
    expect(links).toEqual([["Open work", "/?status=open"], ["Website", `/?project=${websiteId}`]]);
  });

  it("shows no group until the person saves a view", () => {
    expect(group(withViews([]))).toBeNull();
  });
});
