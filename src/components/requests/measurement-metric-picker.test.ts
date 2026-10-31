import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MetricChoice } from "@/lib/metric-definition-rules";
import { activeMetricNamed, InlineMetricForm, inlineAddName, MetricOptionList, metricPickerOptions } from "./measurement-metric-picker";

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

  it("has one tab stop, starting on the selected metric", () => {
    const html = render({ selectedId: "b", passFail: true, addName: "Another metric" });
    const options = html.match(/<button[^>]*role="option"[^>]*>/g)!;
    expect(options.filter(option => option.includes('tabindex="0"'))).toHaveLength(1);
    expect(options.find(option => option.includes('tabindex="0"'))).toContain('aria-label="Signup completion rate"');
  });

  it("keeps the list reachable when the selected metric is filtered out", () => {
    const html = render({ options: [SIGNUPS], selectedId: "b", passFail: true });
    expect(html.match(/<button[^>]*tabindex="0"[^>]*>/g)).toHaveLength(1);
  });

  it("keeps the Pass/fail check as its own choice beside the library", () => {
    const html = render({ passFail: true });
    expect(html).toMatch(/role="group" aria-label="Metrics library"/);
    expect(html).toMatch(/role="group" aria-label="Pass\/fail check"[\s\S]*role="option"[\s\S]*Pass\/fail check/);
    expect(render()).not.toContain("Pass/fail check");
  });

  it("offers to add what's typed as its own choice after the library (#199)", () => {
    const html = render({ addName: "Checkout completions" });
    expect(html).toMatch(/role="group" aria-label="Metrics library"[\s\S]*role="group" aria-label="Add to the Metrics library"[\s\S]*role="option"[^>]*>[\s\S]*Add “Checkout completions”/);
    expect(render()).not.toContain("Add to the Metrics library");
  });
});

// #199: a metric that isn't in the library is added from the picker.
describe("what inline add offers to add", () => {
  it("is the typed name, tidied, when no active definition has it", () => {
    expect(inlineAddName(library, "  Checkout   completions ")).toBe("Checkout completions");
    expect(inlineAddName(library, "Signup")).toBe("Signup");
  });

  it("is nothing while nothing is typed, or when an active definition has exactly that name", () => {
    expect(inlineAddName(library, "   ")).toBeNull();
    expect(inlineAddName(library, "signups")).toBeNull();
    expect(inlineAddName(library, " CUSTOMER   satisfaction")).toBeNull();
  });

  it("is the name when only an archived definition has it", () => {
    expect(inlineAddName(library, "Old signups")).toBe("Old signups");
  });

  it("finds the active definition that already has a name, so it is offered instead", () => {
    expect(activeMetricNamed(library, "signups ")).toBe(SIGNUPS);
    expect(activeMetricNamed(library, "Old signups")).toBeNull();
  });
});

describe("the inline add form", () => {
  const render = (props: Partial<Parameters<typeof InlineMetricForm>[0]> = {}) => renderToStaticMarkup(createElement(InlineMetricForm, {
    id: "metric", values: { name: "Checkout completions", unit: "" }, fields: {}, error: null, offer: null, pending: false,
    onChange: () => {}, onSubmit: () => {}, onBack: () => {}, onUseOffer: () => {}, onRename: () => {}, ...props,
  }));

  it("asks for a name and a unit only", () => {
    const html = render();
    expect(html).toMatch(/<label[^>]*>Name<\/label>|>Name</);
    expect(html).toContain('value="Checkout completions"');
    expect(html).toMatch(/<legend>Unit<\/legend>/);
    expect(text(html)).toContain("Percentage Count Seconds Minutes");
    expect(html.match(/<input/g)).toHaveLength(5);
    expect(html).not.toMatch(/<label[^>]*>(Where it lives|How it)|type="url"|<textarea/);
    expect(text(html)).toMatch(/Add and use[\s\S]*Back/);
  });

  it("shows each problem beside its field", () => {
    const html = render({ fields: { name: "Give the metric a name.", unit: "Choose a unit." } });
    expect(text(html)).toContain("Give the metric a name.");
    expect(html).toMatch(/role="alert"[^>]*>Choose a unit\./);
  });

  it("offers the existing definition in place of a duplicate", () => {
    const html = render({ offer: SIGNUPS, values: { name: "signups", unit: "percent" } });
    expect(html).toMatch(/role="alert"/);
    expect(text(html)).toContain("“Signups” is already in the Metrics library, counted as Count. Use that one instead.");
    expect(text(html)).toMatch(/Use “Signups”[\s\S]*Change the name/);
    expect(text(html)).not.toContain("Add and use");
  });
});
