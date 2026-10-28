import type { ImpactPeriod } from "@/lib/impact-period"
import { periodKey } from "./period-picker"

/** The Dashboard's own address for a period and an optional teammate: the route reads both from the query. */
export function impactHref({ period, person }: { period: ImpactPeriod | null; person?: string | null }): string {
  const query = new URLSearchParams()
  if (period) query.set("period", periodKey(period))
  if (person) query.set("person", person)
  const text = query.toString()
  return text ? `/impact?${text}` : "/impact"
}
