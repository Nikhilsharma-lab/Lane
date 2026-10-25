import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MetricDefinitionList, type MetricDefinitionListItem } from "./metric-definition-list";

// #196: the Metrics page's list of Metric definitions.
const conversion: MetricDefinitionListItem = { id: "d1", name: "Conversion rate", unit: "percent", link: null, howCounted: "Share of people who start the step and finish it." };
const trials: MetricDefinitionListItem = { id: "d2", name: "Trial starts", unit: "count", link: "https://analytics.example.test/trials?range=30d", howCounted: null };
const render = (definitions: MetricDefinitionListItem[]) => renderToStaticMarkup(createElement(MetricDefinitionList, { definitions }));
const items = (html: string) => [...html.matchAll(/<li\b[\s\S]*?<\/li>/g)].map(match => match[0]);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

describe("The Metrics page list", () => {
  it("names each definition as a heading, with its unit and how it's counted", () => {
    const html = render([conversion]);
    expect(html).toContain('aria-label="Metric definitions"');
    const [item] = items(html);
    expect(item).toMatch(/<h4[^>]*><a[^>]*href="\/settings\/metrics\/d1"[^>]*>Conversion rate<\/a><\/h4>/);
    expect(text(item)).toContain("Unit Percentage");
    expect(text(item)).toContain("How it's counted Share of people who start the step and finish it.");
  });

  it("shows 'Add where this lives' when a definition has no link, leading to where it is edited (#197)", () => {
    const [item] = items(render([conversion]));
    expect(text(item)).toContain("Where it lives Add where this lives");
    expect(item).toMatch(/<a[^>]*href="\/settings\/metrics\/d1"[^>]*>Add where this lives<\/a>/);
    expect(item).not.toContain('target="_blank"');
  });

  it("explains an empty Archived view (#197)", () => {
    const html = renderToStaticMarkup(createElement(MetricDefinitionList, { definitions: [], view: "archived" }));
    expect(text(html)).toContain("No archived metrics");
  });

  it("links to where a definition lives, in a new tab that says so", () => {
    const [item] = items(render([trials]));
    expect(item).toContain('href="https://analytics.example.test/trials?range=30d"');
    expect(item).toMatch(/target="_blank"/);
    expect(item).toMatch(/rel="noopener noreferrer"/);
    expect(text(item)).toContain("(opens in a new tab)");
    expect(text(item)).not.toContain("Add where this lives");
  });

  it("says when how a definition is counted hasn't been written", () => {
    const [item] = items(render([trials]));
    expect(text(item)).toContain("How it's counted Not written yet");
  });

  it("keeps the order it is given", () => {
    const html = render([trials, conversion]);
    expect(items(html).map(item => /<h4[^>]*><a[^>]*>([^<]*)<\/a><\/h4>/.exec(item)?.[1])).toEqual(["Trial starts", "Conversion rate"]);
  });

  it("explains an empty library", () => {
    const html = render([]);
    expect(items(html)).toHaveLength(0);
    expect(text(html)).toContain("No metrics yet");
  });
});
