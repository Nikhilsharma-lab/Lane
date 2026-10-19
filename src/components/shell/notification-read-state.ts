/**
 * Plan item 2.7: the bell's read-state machine. The server's rows and its
 * unread count are one snapshot each, stamped with when their read started;
 * the person's own mark read, mark unread and mark all read are patches on
 * top. A patch shows in the same frame and never visibly reverts on success:
 * it survives a read that started before the action succeeded (which would
 * otherwise show the old row) and stops applying only when a read started
 * after the success returns, or when the action fails. The rows and the count
 * are judged apart: a patch stops applying to the rows once a list read
 * reflects it and to the count once a count read does, so whichever of the two
 * reconciling reads lands first, the other still shows the patch. This is the
 * plan's 1.5 rule restated for a surface whose reads start from the client.
 * No React, no I/O.
 */

export type ReadableRow = { id: string; readAt: string | null }
type ServerList<T> = { items: T[]; startedAt: number }
type ServerCount = { value: number; startedAt: number }
/** `from` is the read state the count's baseline holds for the row, so the count's delta never depends on a newer list. */
type Patch = { token: number; readAt: string | null; from: string | null; confirmedAt?: number }
type AllRead = { token: number; readAt: string; confirmedAt?: number }
export type ReadState<T extends ReadableRow> = {
  list: ServerList<T> | null
  count: ServerCount | null
  patches: Record<string, Patch>
  allRead: AllRead | null
}

/** The seed count (the layout promise) started before anything the person does. */
export function initialReadState<T extends ReadableRow>(count?: number): ReadState<T> {
  return { list: null, count: count === undefined ? null : { value: count, startedAt: 0 }, patches: {}, allRead: null }
}

/**
 * A read that started after the action succeeded reflects its write; one that
 * started before does not. Equal stamps count as after: the success is stamped
 * before its reconciling read starts, and browsers coarsen performance.now().
 */
const reflectedBy = (stamp: { confirmedAt?: number }, read: { startedAt: number } | null) =>
  read !== null && stamp.confirmedAt !== undefined && stamp.confirmedAt <= read.startedAt

/** A patch that began before a live mark-all is superseded by it. */
const coveredByAllRead = (allRead: AllRead | null, patch: Patch) => allRead !== null && patch.token < allRead.token

/** The server rows with every patch the list does not yet reflect applied; all rows read while a mark-all is live. */
export function shownItems<T extends ReadableRow>(state: ReadState<T>): T[] {
  const { list, patches } = state
  if (!list) return []
  const allRead = state.allRead && !reflectedBy(state.allRead, list) ? state.allRead : null
  if (!allRead && Object.keys(patches).length === 0) return list.items
  return list.items.map(row => {
    const patch = patches[row.id]
    if (patch && !coveredByAllRead(state.allRead, patch)) {
      if (reflectedBy(patch, list)) return row
      return patch.readAt === row.readAt ? row : { ...row, readAt: patch.readAt }
    }
    if (allRead && row.readAt === null) return { ...row, readAt: allRead.readAt }
    return row
  })
}

/**
 * The server count plus the delta of every patch it does not already reflect,
 * measured from the row's state in the count's baseline (`from`), never from a
 * list that may be newer than the count. A mark-all the count does not reflect
 * forces 0, plus one for each row marked unread after it. Never below 0.
 */
export function shownUnread<T extends ReadableRow>(state: ReadState<T>): number {
  const { count, patches, allRead } = state
  const allReadPending = allRead !== null && !reflectedBy(allRead, count)
  let value = allReadPending ? 0 : count?.value ?? 0
  for (const patch of Object.values(patches)) {
    if (coveredByAllRead(allRead, patch) || reflectedBy(patch, count)) continue
    // Under a mark-all the row is read in the baseline, whatever it was before.
    const from = allReadPending ? allRead.readAt : patch.from
    if (from === null && patch.readAt !== null) value -= 1
    else if (from !== null && patch.readAt === null) value += 1
  }
  return Math.max(0, value)
}

/**
 * Adds the patch, or refuses (null) while an earlier patch on this row is
 * still unconfirmed. Its `from` is the row as shown, unless an earlier patch
 * on the row is not yet in the count: then that patch's own `from`, since the
 * count still holds the state before it. A row the list does not hold gives
 * the count no delta.
 */
export function begin<T extends ReadableRow>(state: ReadState<T>, id: string, readAt: string | null, token: number): ReadState<T> | null {
  const current = state.patches[id]
  if (current && current.confirmedAt === undefined) return null
  const shown = shownItems(state).find(row => row.id === id)
  const from = current && !coveredByAllRead(state.allRead, current) && !reflectedBy(current, state.count) ? current.from : shown ? shown.readAt : readAt
  return { ...state, patches: { ...state.patches, [id]: { token, readAt, from } } }
}

/** Adds the mark-all patch, or refuses (null) while one is still unconfirmed. */
export function beginAllRead<T extends ReadableRow>(state: ReadState<T>, readAt: string, token: number): ReadState<T> | null {
  if (state.allRead && state.allRead.confirmedAt === undefined) return null
  return { ...state, allRead: { token, readAt } }
}

const entryOf = (state: ReadState<ReadableRow>, token: number) => Object.entries(state.patches).find(([, patch]) => patch.token === token)

/** The action succeeded at `at`; the patch stays until a read started after `at` returns. */
export function confirm<T extends ReadableRow>(state: ReadState<T>, token: number, at: number): ReadState<T> {
  if (state.allRead?.token === token) return { ...state, allRead: { ...state.allRead, confirmedAt: at } }
  const entry = entryOf(state, token)
  if (!entry) return state
  return { ...state, patches: { ...state.patches, [entry[0]]: { ...entry[1], confirmedAt: at } } }
}

/** The action failed: the patch goes and the server rows show through. */
export function rollback<T extends ReadableRow>(state: ReadState<T>, token: number): ReadState<T> {
  if (state.allRead?.token === token) return { ...state, allRead: null }
  const entry = entryOf(state, token)
  if (!entry) return state
  const patches = { ...state.patches }
  delete patches[entry[0]]
  return { ...state, patches }
}

/** Forgets the patches (and the mark-all) that both the list and the count reflect. */
function prune<T extends ReadableRow>(state: ReadState<T>): ReadState<T> {
  const done = (stamp: { confirmedAt?: number }) => reflectedBy(stamp, state.list) && reflectedBy(stamp, state.count)
  const patches = Object.fromEntries(Object.entries(state.patches).filter(([, patch]) => !done(patch)))
  const allRead = state.allRead && done(state.allRead) ? null : state.allRead
  return { ...state, patches, allRead }
}

/**
 * A list response. Patches confirmed before this read started stop applying to
 * the rows; unconfirmed ones and those confirmed later stay on top. A response
 * from a read started before the current list's read is ignored.
 */
export function receiveList<T extends ReadableRow>(state: ReadState<T>, items: T[], startedAt: number): ReadState<T> {
  if (state.list && startedAt < state.list.startedAt) return state
  return prune({ ...state, list: { items, startedAt } })
}

/**
 * A count response; the later-started read wins. A read that started before a
 * live action succeeded may or may not hold its write, so it is ignored: the
 * count read the adapter starts after every action settles decides instead.
 */
export function receiveCount<T extends ReadableRow>(state: ReadState<T>, value: number, startedAt: number): ReadState<T> {
  if (state.count && startedAt < state.count.startedAt) return state
  const read = { startedAt }
  const live = [...Object.values(state.patches), ...(state.allRead ? [state.allRead] : [])]
  if (live.some(stamp => !reflectedBy(stamp, read))) return state
  return prune({ ...state, count: { value, startedAt } })
}

/** True while this row's own patch is unconfirmed (its toggle is disabled). */
export function isPending<T extends ReadableRow>(state: ReadState<T>, id: string): boolean {
  const patch = state.patches[id]
  return patch !== undefined && patch.confirmedAt === undefined
}

/** The rows whose own patch is unconfirmed; every other row stays live. */
export function pendingIds<T extends ReadableRow>(state: ReadState<T>): ReadonlySet<string> {
  return new Set(Object.entries(state.patches).filter(([, patch]) => patch.confirmedAt === undefined).map(([id]) => id))
}

/** True while a mark-all is unconfirmed (its button is disabled). */
export function isAllReadPending<T extends ReadableRow>(state: ReadState<T>): boolean {
  return state.allRead !== null && state.allRead.confirmedAt === undefined
}
