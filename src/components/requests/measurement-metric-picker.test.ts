import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MetricChoice } from "@/lib/metric-definition-rules";
import { MetricOptionList, metricPickerOptions } from "./measurement-metric-picker";

// #198: the prediction form's metric picker offers the Metrics library.
const choice = (over: Partial<MetricChoice>): MetricChoice => ({ id: "id", name: "Name", unit: "count", link: null, howCounted: null, archived: false, ...over });
const SIGNUPS = choice({ id: "a", name: "Signups", unit: "count", link: "https://analytics.example.test/signups", howCounted: "New accounts created in the window." });
const SIGNUP_RATE = choice({ id: "b", name: "Signup completion rate", unit: "percent" });
const CSAT = choice({ id: "c", name: "Customer satisfaction", unit: "percent" });
const OLD = choice({ id: "d", name: "Old signups", archived: true });
const library = [CSAT, OLD, SIGNUP_RATE, SIGNUPS];
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

describe("filtering the library as you type", () => {
  it("matches the plain text of the name anywhere, ignoring case and extra spaces", () => {
    expect(metricPickerOptions(library, "", null).map(c => c.name)).toEqual(["Customer satisfaction", "Signup completion rate", "Signups"]);
    expect(metricPickerOptions(library, "  SIGNUP ", null).map(c => c.name)).toEqual(["Signup completion rate", "Signups"]);
    expect(metricPickerOptions(library, "completion   rate", null).map(c => c.name)).toEqual(["Signup completion rate"]);
  });

  it("doesn't guess at similar names", () => {
    expect(metricPickerOptions(library, "sign-ups", null)).toEqual([]);
    expect(metricPickerOptions(library, "CSAT", null)).toEqual([]);
  });

  it("never offers an archived definition, except the one already selected", () => {
    expect(metricPickerOptions(library, "signups", null).map(c => c.id)).toEqual(["a"]);
    expect(metricPickerOptions(library, "signups", "d").map(c => c.id)).toEqual(["d", "a"]);
  });
});

describe("the options", () => {
  const render = (props: Partial<Parameters<typeof MetricOptionList>[0]> = {}) => renderToStaticMarkup(createElement(MetricOptionList, {
    id: "metric", options: [SIGNUPS, SIGNUP_RATE], selectedId: "a", passFail: false, passFailSelected: false, onPick: () => {}, ...props,
  }));

  it("shows each definition's unit, link and how it's counted, announced with the option", () => {
    const html = render();
    const [first] = html.match(/<button[^>]*role="option"[\s\S]*?<\/button>/g)!;
    expect(first).toContain('aria-selected="true"');
    expect(first).toMatch(/aria-label="Signups"/);
    const described = first.match(/aria-describedby="([^"]+)"/)![1];
    expect(text(html.match(new RegExp(`<span[^>]*id="${described}"[\\s\\S]*?</span></span>`))![0])).toBe(
      "Count · New accounts created in the window. · https://analytics.example.test/signups");
    expect(text(html)).toContain("Percentage · How it's counted isn't written down yet · No link yet");
  });

  it("marks an archived definition the Request already uses", () => {
    expect(render({ options: [OLD], selectedId: "d" })).toMatch(/aria-label="Old signups, archived"/);
  });

  it("keeps the Pass/fail check as its own choice beside the library", () => {
    const html = render({ passFail: true });
    expect(html).toMatch(/role="group" aria-label="Metrics library"/);
    expect(html).toMatch(/role="group" aria-label="Pass\/fail check"[\s\S]*role="option"[\s\S]*Pass\/fail check/);
    expect(render()).not.toContain("Pass/fail check");
  });
});
