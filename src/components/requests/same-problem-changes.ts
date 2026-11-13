import type { Iterations } from "@/lib/impact-read-model"
import { iterationLabel } from "@/lib/same-problem-rules"

/**
 * #279 (story 68): the Iterations the moment a Request is taken out of the group, oldest first and numbered again as the
 * server will number them, and the Request still in the group that Undo re-links it to (`rejoin`). A group needs two:
 * with fewer left, or with this Request taken out, the section shows no group.
 */
export function withoutIteration(iterations: Iterations, requestId: string): { shown: Iterations | null; rejoin: string | null } {
  const left = iterations.iterations.filter(entry => entry.requestId !== requestId)
  const rejoin = left.find(entry => entry.current)?.requestId ?? left[0]?.requestId ?? null
  const current = left.find(entry => entry.current)
  if (left.length < 2 || !current) return { shown: null, rejoin }
  const numbered = left.map((entry, index) => ({ ...entry, number: index + 1, label: iterationLabel(index + 1) }))
  const shownCurrent = numbered.find(entry => entry.current)!
  return { shown: { current: { number: shownCurrent.number, label: shownCurrent.label }, iterations: numbered }, rejoin }
}
