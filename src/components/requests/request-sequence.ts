/**
 * Plan item 2.5: Request detail's previous and next, as pure functions. The
 * list records the order it showed when a Request is opened from it; detail
 * reads its place in that order. Memory only, so a reload or a deep link has
 * no sequence.
 */

/** The list's filtered, sorted and grouped order across every page, and the Request opened from it. */
export type DetailSequence = { ids: readonly string[]; openedId: string }

export type SequencePosition = { index: number; total: number; previousId: string | null; nextId: string | null }

/** A snapshot of the list's order: a later change to the list does not renumber it. */
export function captureSequence(ids: readonly string[], openedId: string): DetailSequence {
  return { ids: [...ids], openedId }
}

/**
 * Where the current Request sits in the sequence, or null when there is none
 * or the sequence belongs to another Request (an arrival from search, a
 * notification or a typed URL after leaving the chain).
 */
export function sequencePosition(sequence: DetailSequence | null | undefined, currentId: string): SequencePosition | null {
  if (!sequence || sequence.openedId !== currentId) return null
  const index = sequence.ids.indexOf(currentId)
  if (index < 0) return null
  return {
    index,
    total: sequence.ids.length,
    previousId: index > 0 ? sequence.ids[index - 1] : null,
    nextId: index < sequence.ids.length - 1 ? sequence.ids[index + 1] : null,
  }
}

/** The same sequence, now opened at `id` (J or K keeps the chain valid). */
export function advanceSequence(sequence: DetailSequence, id: string): DetailSequence {
  return { ids: sequence.ids, openedId: id }
}
