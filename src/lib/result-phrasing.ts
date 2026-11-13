/**
 * #279 (Build 6, decision 8; #242 item 3): the one place a result is worded against its goal. The Closed step uses it
 * now and Build 7's Impact (#282) extends it, so every screen says a result the same way. Pure and client-safe.
 *
 * Which way is good comes from the goal itself: a goal of 90 minutes from 240 falls, 55% from 40% rises. There is no
 * stored direction. Results read the same whether they're past the goal or short of it: no Met / Missed, no colour.
 * Units are the read models' unit labels: "%" for a percentage, "count" for a count, otherwise the unit's own name.
 */

/** A pass/fail check's two results. */
export const PASSED = "Passed";
export const DIDNT_PASS = "Didn’t pass";

/** "Passed" or "Didn’t pass": a pass/fail check's result, everywhere. */
export const passFailText = (passed: boolean) => (passed ? PASSED : DIDNT_PASS);

/** A numeric goal: where it started (null when that isn't known) and where it should end, in its unit. */
export type NumericGoal = { unit: string; baseline: number | null; target: number | null };

export type GoalDirection = "rising" | "falling";

/** Whether the goal rises or falls, from its start and end; null when there's no start or nowhere to go. */
export function goalDirection({ baseline, target }: Pick<NumericGoal, "baseline" | "target">): GoalDirection | null {
  if (baseline === null || target === null || baseline === target) return null;
  return target > baseline ? "rising" : "falling";
}

/** A value in its unit: "62%", "12" for a count, "75 minutes". */
export function resultValueText(value: number, unit: string): string {
  if (unit === "%") return `${value}%`;
  if (unit === "count") return `${value}`;
  return `${value} ${unit}`.trim();
}

/**
 * A numeric goal as its end value, with where it starts when that's known: "80% (from 62%)", "12". The same words as
 * Impact's goal (impact-presenter.ts `goalText`), which #282 can build on this.
 */
export function goalValueText({ unit, baseline, target }: NumericGoal): string {
  if (target === null) return "No goal set";
  const end = resultValueText(target, unit);
  return baseline !== null ? `${end} (from ${resultValueText(baseline, unit)})` : end;
}

/** How far a result is from its goal, in the goal's direction; null without a direction. */
export type GoalGap = { kind: "past" | "short"; amount: number } | { kind: "exact" };

export function gapToGoal(actual: number, goal: NumericGoal): GoalGap | null {
  const direction = goalDirection(goal);
  if (direction === null || goal.target === null) return null;
  const amount = Math.abs(roundLike(actual - goal.target, actual, goal.target));
  if (amount === 0) return { kind: "exact" };
  const beyond = direction === "rising" ? actual > goal.target : actual < goal.target;
  return { kind: beyond ? "past" : "short", amount };
}

/** A gap's size: percentages in points ("8 points", "1 point"); every other unit as a bare number ("15"). */
export function gapAmountText(amount: number, unit: string): string {
  return unit === "%" ? `${amount} ${amount === 1 ? "point" : "points"}` : `${amount}`;
}

/** The true minus sign, never a hyphen, on a signed change. */
export const MINUS = "−";

/**
 * #282: a signed change in its unit, with a true minus sign: "+6 points" for a percentage (a difference of
 * percentages is in points), "−165 minutes", "+30" for a count. Zero reads "No change".
 */
export function changeAmountText(change: number, unit: string): string {
  if (change === 0) return "No change";
  const sign = change > 0 ? "+" : MINUS;
  const amount = Math.abs(change);
  return `${sign}${unit === "%" ? gapAmountText(amount, unit) : resultValueText(amount, unit)}`;
}

/** #282: pass/fail checks counted together: "1 passed, 0 didn’t pass". */
export function passFailCountText({ passed, didntPass }: { passed: number; didntPass: number }): string {
  return `${passed} ${PASSED.toLowerCase()}, ${didntPass} ${DIDNT_PASS.toLowerCase()}`;
}

/**
 * A measured result against its goal: "Reached 75 minutes, 15 past the goal", "Reached 47%, 8 points short of the
 * goal", "Reached 80%, exactly the goal". Without a direction (no start, or a start equal to the end) it states the
 * goal beside it: "Reached 80% (goal 80%)". With no goal set, the result alone.
 */
export function resultAgainstGoal(actual: number, goal: NumericGoal): string {
  const reached = `Reached ${resultValueText(actual, goal.unit)}`;
  if (goal.target === null) return reached;
  const gap = gapToGoal(actual, goal);
  if (gap === null) return `${reached} (goal ${resultValueText(goal.target, goal.unit)})`;
  if (gap.kind === "exact") return `${reached}, exactly the goal`;
  const amount = gapAmountText(gap.amount, goal.unit);
  return gap.kind === "past" ? `${reached}, ${amount} past the goal` : `${reached}, ${amount} short of the goal`;
}

/** The difference at the precision of its inputs, so 0.3 − 0.2 is 0.1, not 0.09999999999999998. */
function roundLike(difference: number, ...inputs: number[]) {
  const places = Math.min(10, Math.max(0, ...inputs.map(decimalPlaces)));
  return Number(difference.toFixed(places));
}

function decimalPlaces(n: number) {
  const [, fraction = ""] = String(n).split(".");
  return fraction.length;
}
