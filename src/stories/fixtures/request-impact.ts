import { expect, userEvent, waitFor, within } from "storybook/test";
import type { ExpectedImpact } from "@/lib/request-impact";
import { createEmptyMeasurementPlan, createMeasurementPrimary } from "@/lib/request-measurement";

export const measurementImpact = {
  ...createEmptyMeasurementPlan(),
  primary: { ...createMeasurementPrimary("conversion"), target: 90 },
  measurement: { ...createEmptyMeasurementPlan().measurement, windowDays: 14 as const },
};

export const metricImpact = {
  kind: "metric",
  metric: "Customers finding a saved draft",
  baseline: null,
  target: 90,
  unit: "%",
  source: "",
  reviewAfterDays: 14,
} satisfies ExpectedImpact;

export const verifiedImpact = {
  kind: "verification",
  result: "Customers can reopen an unfinished draft after signing in again.",
  source: "",
  reviewAfterDays: 1,
} satisfies ExpectedImpact;

/** Opens the composer's Expected impact disclosure when it is folded (plan item 2.3). */
export async function openImpact(canvas: ReturnType<typeof within>) {
  const toggle = canvas.queryByRole("button", { name: /^(Add|Edit) expected impact$/ });
  if (toggle?.getAttribute("aria-expanded") === "false") await userEvent.click(toggle);
}

export async function fillMetricImpact(canvas: ReturnType<typeof within>) {
  const metric = canvas.queryByRole("combobox", { name: "Metric" });
  if (metric) {
    const page = within(metric.ownerDocument.body);
    await userEvent.click(metric);
    await userEvent.click(await page.findByRole("option", { name: "Conversion rate" }));
    await waitFor(() => expect(metric).toHaveFocus());
    await userEvent.type(canvas.getByRole("spinbutton", { name: "Target after release (optional)" }), "90");
    const window = canvas.getByRole("button", { name: "Measurement window" });
    await userEvent.click(window);
    await userEvent.click(await page.findByRole("menuitem", { name: "14 days after release" }));
    await waitFor(() => expect(window).toHaveFocus());
    return;
  }
  await openImpact(canvas);
  await userEvent.type(canvas.getByRole("textbox", { name: "What should improve?" }), metricImpact.metric);
  await userEvent.type(canvas.getByRole("spinbutton", { name: "Goal" }), String(metricImpact.target));
  const unit = canvas.getByRole("textbox", { name: "Measured in" });
  await userEvent.clear(unit);
  await userEvent.type(unit, metricImpact.unit);
  await userEvent.type(canvas.getByRole("spinbutton", { name: "Check in days" }), String(metricImpact.reviewAfterDays));
}
