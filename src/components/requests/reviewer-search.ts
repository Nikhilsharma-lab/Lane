import type { ReviewPerson } from "@/lib/request-review"

/**
 * Plan item 2.6: the reviewer picker's pure parts. The roster is filtered in
 * the browser with the same normalisation the Project picker uses; the server
 * is asked only when the roster is truncated or failed to load.
 */

/** Typing pauses this long before teammates are searched on the server; Enter searches at once. */
export const REVIEWER_DEBOUNCE_MS = 150
/** The route's own sentence for a roster over 100 people: the server search path takes over. */
export const ROSTER_TRUNCATED = /more specific name/i

export const normalizeQuery = (query: string) => query.trim().replace(/\s+/g, " ").toLocaleLowerCase()
export const nameMatches = (name: string, normalized: string) => name.toLocaleLowerCase().includes(normalized)

/** The people whose name contains the query, case and whitespace aside; everyone for an empty query. */
export function filterRoster(roster: ReviewPerson[], query: string) {
  const normalized = normalizeQuery(query)
  return normalized ? roster.filter(person => nameMatches(person.name, normalized)) : roster
}

/** The listbox's rows: every selected person first, then the matches, each person once. */
export function mergeOptions(selected: ReviewPerson[], matches: ReviewPerson[]) {
  return [...new Map([...selected, ...matches].map(person => [person.id, person])).values()]
}

/** The one line under the list; null when the roster is complete and nothing has been typed. */
export function pickerStatus({ searching, error, full, limit, narrow, local, normalized, matches }: {
  searching: boolean; error: string | null; full: boolean; limit: number; narrow: boolean; local: boolean; normalized: string; matches: number
}): string | null {
  if (searching) return "Finding teammates…"
  if (error) return null
  if (full) return `${limit} of ${limit} selected. Remove one to add another.`
  if (narrow) return "Type a more specific name to find a teammate."
  if (matches === 0) return normalized || !local ? "No teammates match. Try another name." : null
  if (local && !normalized) return null
  return matches === 1 ? "1 teammate matches" : `${matches} teammates match`
}
