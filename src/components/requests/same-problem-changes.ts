import type { Iterations } from "@/lib/impact-read-model"
import { iterationLabel } from "@/lib/same-problem-rules"

/**
 * #279 (story 68): the Iterations the moment a Request is taken out of the group, oldest first and numbered again as the
 * server will number them, and the Request still in the group that Undo re-links it to (`rejoin`). A group needs two:
 * with fewer left, or with this Request taken out, the section shows no group.
 */
export function withoutIteration(iterations: Iterations, requestId: string): { shown: Iterations | null; rejoin: string | null } {
  const left = iterations.iterations.filter(entry => entry.requestId !== requestId)
  const at = left.findIndex(entry => entry.current)
  const rejoin = left[Math.max(at, 0)]?.requestId ?? null
  if (left.length < 2 || at < 0) return { shown: null, rejoin }
  const numbered = left.map((entry, index) => ({ ...entry, number: index + 1, label: iterationLabel(index + 1) }))
  return { shown: { current: { number: at + 1, label: iterationLabel(at + 1) }, iterations: numbered }, rejoin }
}
