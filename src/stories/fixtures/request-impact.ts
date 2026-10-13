import { userEvent, within } from "storybook/test";
import type { ExpectedImpact } from "@/lib/request-impact";

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

export async function fillMetricImpact(canvas: ReturnType<typeof within>) {
  const disclosure = canvas.queryByRole("button", { name: "Expected impact" });
  if (disclosure?.getAttribute("aria-expanded") === "false") await userEvent.click(disclosure);
  await userEvent.type(canvas.getByRole("textbox", { name: "What should improve?" }), metricImpact.metric);
  await userEvent.type(canvas.getByRole("spinbutton", { name: "Goal" }), String(metricImpact.target));
  const unit = canvas.getByRole("textbox", { name: "Measured in" });
  await userEvent.clear(unit);
  await userEvent.type(unit, metricImpact.unit);
  await userEvent.type(canvas.getByRole("spinbutton", { name: "Check in days" }), String(metricImpact.reviewAfterDays));
}
