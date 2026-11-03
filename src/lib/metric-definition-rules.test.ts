import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  METRIC_HOW_COUNTED_MAX, METRIC_LINK_MAX, METRIC_NAME_MAX, metricDefinitionFieldErrors, metricDefinitionInputSchema,
  metricDefinitionProblems,
} from "./metric-definition-rules";

// The metric forms check a definition in the browser without zod (zod alone was about 23 KB gzip of each Metrics
// page's first load). The browser's answer must be the server schema's answer, field for field and word for word.
const serverProblems = (values: Record<string, unknown>) => {
  const parsed = metricDefinitionInputSchema.safeParse(values);
  return parsed.success ? {} : metricDefinitionFieldErrors(parsed.error);
};

describe("checking a Metric definition in the browser", () => {
  it("finds nothing wrong with a complete definition", () => {
    expect(metricDefinitionProblems({ name: "Orders placed", unit: "count", link: "", howCounted: "" })).toEqual({});
  });

  it("names each problem beside its field, as the server does", () => {
    expect(metricDefinitionProblems({ name: "   ", unit: "", link: "ftp://example.com", howCounted: "x".repeat(METRIC_HOW_COUNTED_MAX + 1) })).toEqual({
      name: "Give the metric a name.",
      unit: "Choose a unit.",
      link: "Enter a link that starts with https:// or http://.",
      howCounted: "Keep how it's counted to 500 characters or fewer.",
    });
    expect(metricDefinitionProblems({ name: "x".repeat(METRIC_NAME_MAX + 1), unit: "percent", link: `https://${"a".repeat(METRIC_LINK_MAX)}`, howCounted: "" })).toEqual({
      name: "Keep the name to 120 characters or fewer.",
      link: "Keep the link to 2048 characters or fewer.",
    });
  });

  it("gives the server schema's answer for every mix of names, units, links and counting notes", () => {
    const names = ["", " ", "Orders", "  Orders  ", "x".repeat(METRIC_NAME_MAX), "x".repeat(METRIC_NAME_MAX + 1), ` ${"x".repeat(METRIC_NAME_MAX)} `];
    const units = ["", "count", "percent", "seconds", "minutes", "hours", "Count"];
    const links = ["", "  ", "https://example.com/report", " http://x.io ", "HTTPS://EXAMPLE.COM", "example.com", "https://", "https://a b",
      `https://${"a".repeat(METRIC_LINK_MAX - 8)}`, `https://${"a".repeat(METRIC_LINK_MAX - 7)}`, ` ftp ${"a".repeat(METRIC_LINK_MAX)}`];
    const notes = ["", " ", "Orders divided by visits.", "x".repeat(METRIC_HOW_COUNTED_MAX), "x".repeat(METRIC_HOW_COUNTED_MAX + 1), ` ${"x".repeat(METRIC_HOW_COUNTED_MAX)} `];
    let compared = 0;
    for (const name of names) for (const unit of units) for (const link of links) for (const howCounted of notes) {
      const values = { name, unit, link, howCounted };
      expect(metricDefinitionProblems(values), JSON.stringify(values)).toEqual(serverProblems(values));
      compared++;
    }
    expect(compared).toBe(names.length * units.length * links.length * notes.length);
  });
});

// Only the server actions parse with the zod schemas; a form that did would bring zod back into its page's first load.
describe("the zod schemas for Metric definitions", () => {
  const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

  it("are used only by the server actions", () => {
    const root = join(process.cwd(), "src");
    const users = sources(root)
      .filter(file => /\b(metricDefinitionInputSchema|inlineMetricInputSchema)\b/.test(readFileSync(file, "utf8")))
      .map(file => relative(root, file)).sort();
    expect(users).toEqual(["app/(app)/intake/metric-actions.ts", "app/(app)/settings/metrics/actions.ts", "lib/metric-definition-rules.ts"]);
  });
});
