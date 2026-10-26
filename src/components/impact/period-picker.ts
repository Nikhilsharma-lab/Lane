import { periodLabel, type ImpactPeriod, type Month } from "@/lib/impact-period"

// The Outcome report's period picker (#208): a month, a quarter or a year. The route reads the key from the URL and
// passes parsePeriodKey's result to the read model, which does the grouping by release date. Nothing is totalled here.

export type PeriodKind = ImpactPeriod["kind"]
export type PeriodChoice = { key: string; label: string; period: ImpactPeriod }

/** How far back the picker reaches: 24 months, 8 quarters or 3 years, newest first. */
const REACH: Record<PeriodKind, number> = { month: 24, quarter: 8, year: 3 }

/** The period of a kind that holds a month (1 to 12) of a year. */
function holding(kind: PeriodKind, year: number, month: number): ImpactPeriod {
  if (kind === "year") return { kind, year }
  if (kind === "quarter") return { kind, year, quarter: Math.ceil(month / 3) as 1 | 2 | 3 | 4 }
  return { kind, year, month: month as Month }
}

/** The months a period spans, as [first, last]. */
function monthsOf(period: ImpactPeriod): [number, number] {
  if (period.kind === "year") return [1, 12]
  if (period.kind === "quarter") return [period.quarter * 3 - 2, period.quarter * 3]
  return [period.month, period.month]
}

/** The picker's options for one kind, from the period holding `now` back as far as REACH, newest first. */
export function periodChoices(kind: PeriodKind, now: Date): PeriodChoice[] {
  const step = kind === "year" ? 12 : kind === "quarter" ? 3 : 1
  const latest = now.getUTCFullYear() * 12 + now.getUTCMonth()
  return Array.from({ length: REACH[kind] }, (_, index) => {
    const at = latest - index * step
    const period = holding(kind, Math.floor(at / 12), (at % 12) + 1)
    return { key: periodKey(period), label: periodLabel(period), period }
  })
}

/** The period of another kind that keeps the same time in view: the one holding the current period's last month, or now if that is later. */
export function periodOfKind(kind: PeriodKind, current: ImpactPeriod, now: Date): ImpactPeriod {
  const last = current.year * 12 + monthsOf(current)[1] - 1
  const at = Math.min(last, now.getUTCFullYear() * 12 + now.getUTCMonth())
  return holding(kind, Math.floor(at / 12), (at % 12) + 1)
}

export function periodKey(period: ImpactPeriod): string {
  if (period.kind === "year") return String(period.year)
  return period.kind === "quarter" ? `${period.year}-q${period.quarter}` : `${period.year}-${String(period.month).padStart(2, "0")}`
}

/** Reads a picker key back into a period; anything unrecognised means no choice (the report shows the current quarter). */
export function parsePeriodKey(key: string | null | undefined): ImpactPeriod | null {
  if (!key) return null
  const quarter = /^(\d{4})-q([1-4])$/.exec(key)
  if (quarter) return { kind: "quarter", year: Number(quarter[1]), quarter: Number(quarter[2]) as 1 | 2 | 3 | 4 }
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key)
  if (month) return { kind: "month", year: Number(month[1]), month: Number(month[2]) as Month }
  if (/^\d{4}$/.test(key)) return { kind: "year", year: Number(key) }
  return null
}
