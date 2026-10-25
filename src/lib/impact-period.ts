/**
 * The Impact page's periods (#208): a month, a quarter or a year, always in UTC. Pure and client-safe, so the period
 * picker can name periods without loading the read model.
 */

export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export type ImpactPeriod =
  | { kind: "year"; year: number }
  | { kind: "quarter"; year: number; quarter: Quarter }
  | { kind: "month"; year: number; month: Month };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** A period in words: "2026", "Q3 2026" or "July 2026". */
export function periodLabel(period: ImpactPeriod): string {
  if (period.kind === "year") return String(period.year);
  return period.kind === "quarter" ? `Q${period.quarter} ${period.year}` : `${MONTH_NAMES[period.month - 1]} ${period.year}`;
}

/** The quarter a moment falls in (UTC): the Outcome report's period when none is chosen. */
export function quarterOf(now: Date): ImpactPeriod {
  return { kind: "quarter", year: now.getUTCFullYear(), quarter: (Math.floor(now.getUTCMonth() / 3) + 1) as Quarter };
}

/** Whether a UTC date (YYYY-MM-DD) falls in a period. */
export function inPeriod(date: string, period: ImpactPeriod): boolean {
  if (Number(date.slice(0, 4)) !== period.year) return false;
  if (period.kind === "year") return true;
  const month = Number(date.slice(5, 7));
  if (period.kind === "month") return month === period.month;
  return month >= (period.quarter - 1) * 3 + 1 && month <= period.quarter * 3;
}

export type Quarter = 1 | 2 | 3 | 4;

/** The quarters whose Quarter notes a period's report ends with (#209): a quarter's own, all four of a year's, none for a month. */
export function quartersOf(period: ImpactPeriod): { year: number; quarter: Quarter }[] {
  if (period.kind === "month") return [];
  if (period.kind === "quarter") return [{ year: period.year, quarter: period.quarter }];
  return ([1, 2, 3, 4] as const).map(quarter => ({ year: period.year, quarter }));
}

/** Whether a quarter has begun by `now` (UTC): a Quarter note is written during or after its quarter, never before. */
export function quarterStarted(year: number, quarter: Quarter, now: Date): boolean {
  return Date.UTC(year, (quarter - 1) * 3, 1) <= now.getTime();
}
