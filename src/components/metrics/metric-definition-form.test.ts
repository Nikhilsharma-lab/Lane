import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MetricDefinitionForm } from "./metric-definition-form";

// #198: once a Request uses a definition, the edit form shows its unit but doesn't offer to change it.
const render = (unitLocked: boolean) => renderToStaticMarkup(createElement(MetricDefinitionForm, {
  initial: { name: "Signups", unit: "count", link: "", howCounted: "" }, submitLabel: "Save changes", unitLocked, onSubmit: async () => ({ ok: true as const }),
}));

describe("The definition form's unit", () => {
  it("can be chosen while no Request uses the definition", () => {
    expect(render(false)).toContain('role="combobox"');
    expect(render(false)).toContain('aria-required="true"');
  });

  it("is shown, and explained, once a Request uses it", () => {
    const html = render(true);
    expect(html).not.toContain('role="combobox"');
    expect(html).toContain("Count");
    expect(html).toContain("A Request uses this metric, so its unit can&#x27;t change.");
  });
});
