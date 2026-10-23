import type { ImpactPeriod } from "@/lib/impact-read-model"

// The quarter/year selector's values. The route reads the key from the URL and passes parsePeriodKey's result
// to the read model; the read model does the grouping by release date. No totals are computed here.

export type PeriodChoice = { key: string; label: string; period: ImpactPeriod | null }

const quarters = (year: number): ImpactPeriod[] => [4, 3, 2, 1].map(quarter => ({ kind: "quarter" as const, year, quarter: quarter as 1 | 2 | 3 | 4 }))

/** The selector's options: all dates, then the given year and its quarters, then the year before. Newest first. */
export function periodChoices(year: number): PeriodChoice[] {
  const periods: (ImpactPeriod | null)[] = [null, { kind: "year", year }, ...quarters(year), { kind: "year", year: year - 1 }, ...quarters(year - 1)]
  return periods.map(period => ({ key: periodKey(period), label: periodLabel(period), period }))
}

export function periodKey(period: ImpactPeriod | null): string {
  if (period === null) return "all"
  return period.kind === "year" ? String(period.year) : `${period.year}-q${period.quarter}`
}

/** Reads a selector key back into a period; anything unrecognised means all dates. */
export function parsePeriodKey(key: string | null | undefined): ImpactPeriod | null {
  if (!key) return null
  const quarter = /^(\d{4})-q([1-4])$/.exec(key)
  if (quarter) return { kind: "quarter", year: Number(quarter[1]), quarter: Number(quarter[2]) as 1 | 2 | 3 | 4 }
  if (/^\d{4}$/.test(key)) return { kind: "year", year: Number(key) }
  return null
}

export function periodLabel(period: ImpactPeriod | null): string {
  if (period === null) return "All dates"
  return period.kind === "year" ? String(period.year) : `Q${period.quarter} ${period.year}`
}
