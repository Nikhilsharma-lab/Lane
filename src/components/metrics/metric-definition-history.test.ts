import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MetricDefinitionHistory, type MetricHistoryItem } from "./metric-definition-history";

// Dates read "24 Oct" in the current year and "24 Oct 2025" in others (#261): pin the year these fixtures are in.
beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-23T12:00:00.000Z") }); });
afterAll(() => { vi.useRealTimers(); });

// #197: a Metric definition's history on its page.
const snapshot = { name: "Trial starts", unit: "count", link: "https://analytics.example.test/trials", howCounted: "Trials started per week.", archivedAt: null, mergedIntoId: null };
const entry = (revision: number, kind: MetricHistoryItem["kind"], before: Record<string, unknown> | null, after: Record<string, unknown>, authorName: string | null = "Pat Lee"): MetricHistoryItem =>
  ({ revision, kind, before, after, authorName, createdAt: `2026-10-2${revision}T10:00:00.000Z` });
const render = (entries: MetricHistoryItem[]) => renderToStaticMarkup(createElement(MetricDefinitionHistory, { entries }));
const items = (html: string) => html.split(/<li class="[^"]*entry[^"]*"/).slice(1).map(item => item.slice(item.indexOf(">") + 1));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, " ").trim();

describe("Metric definition history", () => {
  it("lists changes newest first, each with who and when", () => {
    const html = render([entry(1, "created", null, snapshot), entry(2, "archived", snapshot, { ...snapshot, archivedAt: "2026-10-22T10:00:00.000Z" }, "Sam Ortiz")]);
    expect(html).toContain('aria-label="Changes to this metric"');
    const [newest, oldest] = items(html);
    expect(text(newest)).toMatch(/^Archived by Sam Ortiz 22 Oct$/);
    expect(text(oldest)).toMatch(/^Added by Pat Lee 21 Oct /);
    expect(newest).toContain('dateTime="2026-10-22T10:00:00.000Z"');
  });

  it("names units in words and says when a field was removed", () => {
    const html = render([entry(2, "edited", snapshot, { ...snapshot, unit: "percent", link: null })]);
    expect(text(html)).toContain("Unit changed from Count to Percentage");
    expect(text(html)).toContain("Dashboard link removed: https://analytics.example.test/trials");
    expect(text(html)).not.toContain("Name");
  });

  it("says which metric a merge kept and which it merged away, on each side (#202)", () => {
    const merge = { keptId: "k", keptName: "Trials started", mergedId: "m", mergedName: "Trial starts" };
    const away = text(render([entry(2, "merged_away", snapshot, { ...snapshot, mergedIntoId: "k", merge })]));
    expect(away).toMatch(/^Merged into Trials started by Pat Lee 22 Oct Requests that used it count under Trials started\.$/);
    const into = text(render([entry(2, "merged_into", { ...snapshot, name: "Trials started" }, { ...snapshot, name: "Trials started", merge })]));
    expect(into).toMatch(/^Trial starts merged into this one by Pat Lee 22 Oct Requests that used Trial starts count under this one\.$/);
  });

  it("credits Lane with a starter metric", () => {
    expect(text(render([entry(1, "created", null, snapshot, null)]))).toMatch(/^Added by Lane /);
  });
});
