import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PageStrip, PageStripProvider, type PageStripCrumb, type PageStripProps } from "./page-strip";
import { SidebarControlsProvider, SidebarExpandButton } from "./sidebar-controls";

// Plan item 2.0: the strip's anatomy, rendered as the server sends it.
const trail: PageStripCrumb[] = [{ label: "Lane Studio", href: "/" }, { label: "Settings", href: "/settings/profile" }];
const strip = (props: PageStripProps) => createElement(PageStrip, props);
const framed = (children: ReactNode, value: { trail: readonly PageStripCrumb[]; expand: ReactNode } = { trail, expand: null }) =>
  createElement(PageStripProvider, { value } as Parameters<typeof PageStripProvider>[0], children);
const header = (html: string) => /<header\b[^>]*data-slot="page-strip"[^>]*>[\s\S]*<\/header>/.exec(html)?.[0] ?? "";

describe("PageStrip", () => {
  it("renders one page strip", () => {
    const html = renderToStaticMarkup(strip({ title: "Members" }));
    expect(html.match(/data-slot="page-strip"/g)).toHaveLength(1);
    expect(html.startsWith("<header")).toBe(true);
  });

  it("shows only the title without a trail, as an h1 when it is the page heading", () => {
    const plain = renderToStaticMarkup(strip({ title: "Members" }));
    expect(plain).not.toContain('aria-label="Breadcrumb"');
    expect(plain).not.toContain("<h1");
    const heading = renderToStaticMarkup(strip({ title: "Requests", heading: true }));
    expect(heading).toMatch(/<h1\b[^>]*>Requests<\/h1>/);
  });

  it("links the provider's trail in order and marks the title as the current page", () => {
    const html = renderToStaticMarkup(framed(strip({ title: "Members", heading: true })));
    const nav = /<nav aria-label="Breadcrumb"[^>]*>[\s\S]*<\/nav>/.exec(html)?.[0] ?? "";
    expect([...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(match => [match[1], match[2]])).toEqual([["/", "Lane Studio"], ["/settings/profile", "Settings"]]);
    const items = nav.match(/<li\b[^>]*>/g) ?? [];
    expect(items).toHaveLength(3);
    expect(items.at(-1)).toContain('aria-current="page"');
    expect(nav).toMatch(/<li aria-current="page"><h1\b[^>]*>Members<\/h1><\/li>/);
  });

  it("renders no end group when there are no tools, action or overflow", () => {
    expect(header(renderToStaticMarkup(strip({ title: "Members" })))).not.toContain("<div");
    const withAction = header(renderToStaticMarkup(strip({ title: "Members", action: createElement("button", { type: "button" }, "Invite") })));
    expect(withAction).toMatch(/<div\b[^>]*><div\b[^>]*><button type="button">Invite<\/button><\/div><\/div>/);
  });

  it("shows no expand control and an empty slot without a provider", () => {
    const html = renderToStaticMarkup(strip({ title: "Page not found", heading: true }));
    expect(html).not.toContain("Expand sidebar");
    expect(html).toMatch(/^<header\b[^>]*><span\b[^>]*><\/span>/);
  });

  it("carries the shell's expand control in its slot once the sidebar is collapsed", () => {
    const controls: Omit<Parameters<typeof SidebarControlsProvider>[0], "children"> = { collapsed: true, peeking: false, expand: () => {}, onPointerEnter: () => {}, onPointerLeave: () => {} };
    const html = renderToStaticMarkup(createElement(SidebarControlsProvider, controls as Parameters<typeof SidebarControlsProvider>[0],
      framed(strip({ title: "Members" }), { trail, expand: createElement(SidebarExpandButton) })));
    expect(html).toMatch(/^<header\b[^>]*><span\b[^>]*><button\b[^>]*aria-label="Expand sidebar"/);
  });

  it("titles a string title so a truncated name stays readable", () => {
    expect(renderToStaticMarkup(strip({ title: "Members" }))).toContain('title="Members"');
    expect(renderToStaticMarkup(framed(strip({ title: "Members" })))).toMatch(/<span\b[^>]*title="Members"[^>]*>Members<\/span>/);
    expect(renderToStaticMarkup(strip({ title: createElement("span", null, "Loading") }))).not.toMatch(/title="/);
  });
});
