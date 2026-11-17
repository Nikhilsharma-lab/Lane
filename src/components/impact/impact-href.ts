import type { ImpactPeriod } from "@/lib/impact-period"
import { parsePeriodKey, periodKey } from "./period-picker"

/** Impact's two tabs (#208), by their address value. */
export type ImpactTab = "my-work" | "outcome-report"
const TABS: readonly ImpactTab[] = ["my-work", "outcome-report"]

/** The tab a value names, or null for anything else. */
export const impactTab = (value: string | null) => TABS.find(known => known === value) ?? null

/**
 * What Impact's address holds (#283): the open tab, the Outcome report's period and the person My work shows. Each is
 * null when the address doesn't choose it. The person is only a request: the loader shows them only if they are on the
 * viewer's own teammate list.
 */
export type ImpactAddress = { tab: ImpactTab | null; period: ImpactPeriod | null; person: string | null }

type QueryValue = string | string[] | undefined

/** Impact's own address for a tab, a period and a person, in that order; whatever isn't chosen is left out. */
export function impactHref({ tab = null, period = null, person = null }: Partial<ImpactAddress>): string {
  const query = new URLSearchParams()
  if (tab) query.set("tab", tab)
  if (period) query.set("period", periodKey(period))
  if (person) query.set("person", person)
  const text = query.toString()
  return text ? `/impact?${text}` : "/impact"
}

/** One value from the query: a value given twice, or none, counts as not chosen. */
const single = (value: QueryValue) => typeof value === "string" && value !== "" ? value : null

/** The page's reading of its query. Anything it doesn't recognise counts as not chosen. */
export function readImpactAddress(query: { tab?: QueryValue; period?: QueryValue; person?: QueryValue }): ImpactAddress {
  const tab = single(query.tab)
  return {
    tab: impactTab(tab),
    period: parsePeriodKey(single(query.period)),
    person: single(query.person),
  }
}

/**
 * The tab Impact opens on: the address's, else My work for someone who can file Requests and the Outcome report for
 * someone who can't, whose own list is empty (Nikhil, 2026-11-09).
 */
export function tabToOpen(tab: ImpactTab | null, { canFile }: { canFile: boolean }): ImpactTab {
  return tab ?? (canFile ? "my-work" : "outcome-report")
}
