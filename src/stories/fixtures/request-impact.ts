import { userEvent, within } from "storybook/test";
import type { ExpectedImpact } from "@/lib/request-impact";

export const metricImpact = {
  kind: "metric",
  metric: "Customers finding a saved draft",
  baseline: null,
  target: 90,
  unit: "%",
  source: "Saved-draft usability check",
  reviewAfterDays: 14,
} satisfies ExpectedImpact;

export const verifiedImpact = {
  kind: "verification",
  result: "Customers can reopen an unfinished draft after signing in again.",
  source: "Verify on the supported browsers with a saved draft.",
  reviewAfterDays: 1,
} satisfies ExpectedImpact;

export async function fillMetricImpact(canvas: ReturnType<typeof within>) {
  await userEvent.type(canvas.getByRole("textbox", { name: /^Metric/ }), metricImpact.metric);
  await userEvent.type(canvas.getByRole("spinbutton", { name: /^Target value/ }), String(metricImpact.target));
  await userEvent.type(canvas.getByRole("textbox", { name: /^Unit/ }), metricImpact.unit);
  await userEvent.type(canvas.getByRole("textbox", { name: /^Data source/ }), metricImpact.source);
  await userEvent.type(canvas.getByRole("spinbutton", { name: /^Measure after launch/ }), String(metricImpact.reviewAfterDays));
}
