/**
 * Plan item 2.7: the bell's read-state machine. The server's rows and its
 * unread count are one snapshot each, stamped with when their read started;
 * the person's own mark read, mark unread and mark all read are patches on
 * top. A patch shows in the same frame and never visibly reverts on success:
 * it survives a read that started before the action succeeded (which would
 * otherwise show the old row) and clears only when a read started after the
 * success returns, or when the action fails. This is the plan's 1.5 rule
 * restated for a surface whose reads start from the client. No React, no I/O.
 */

export type ReadableRow = { id: string; readAt: string | null }
type ServerList<T> = { items: T[]; startedAt: number }
type ServerCount = { value: number; startedAt: number }
type Patch = { token: number; readAt: string | null; confirmedAt?: number }
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

/** A read that started after the action succeeded reflects its write; one that started before does not. */
const reflectedBy = (stamp: { confirmedAt?: number }, read: { startedAt: number } | null) =>
  read !== null && stamp.confirmedAt !== undefined && stamp.confirmedAt < read.startedAt

/** A patch that began before a live mark-all is superseded by it. */
const coveredByAllRead = (allRead: AllRead | null, patch: Patch) => allRead !== null && patch.token < allRead.token

/** The server rows with every live patch applied; all rows read while a mark-all is live. */
export function shownItems<T extends ReadableRow>(state: ReadState<T>): T[] {
  const { list, patches, allRead } = state
  if (!list) return []
  if (!allRead && Object.keys(patches).length === 0) return list.items
  return list.items.map(row => {
    const patch = patches[row.id]
    if (patch && !coveredByAllRead(allRead, patch)) return patch.readAt === row.readAt ? row : { ...row, readAt: patch.readAt }
    if (allRead && row.readAt === null) return { ...row, readAt: allRead.readAt }
    return row
  })
}

/**
 * The server count plus the delta of every live patch it does not already
 * reflect, measured against the server row the list holds (0 when the list
 * has no such row). A live mark-all the count does not reflect forces 0, plus
 * one for each row marked unread after it. Never below 0.
 */
export function shownUnread<T extends ReadableRow>(state: ReadState<T>): number {
  const { count, list, patches, allRead } = state
  const rows = new Map((list?.items ?? []).map(row => [row.id, row] as const))
  const allReadPending = allRead !== null && !reflectedBy(allRead, count)
  let value = allReadPending ? 0 : count?.value ?? 0
  for (const [id, patch] of Object.entries(patches)) {
    if (coveredByAllRead(allRead, patch)) continue
    if (allReadPending) { if (patch.readAt === null) value += 1; continue }
    if (reflectedBy(patch, count)) continue
    const row = rows.get(id)
    if (!row) continue
    // Under a live mark-all the server row is read, whatever the stale list says.
    const serverReadAt = allRead && row.readAt === null ? allRead.readAt : row.readAt
    if (serverReadAt === null && patch.readAt !== null) value -= 1
    else if (serverReadAt !== null && patch.readAt === null) value += 1
  }
  return Math.max(0, value)
}

/** Adds the patch, or refuses (null) while an earlier patch on this row is still unconfirmed. */
export function begin<T extends ReadableRow>(state: ReadState<T>, id: string, readAt: string | null, token: number): ReadState<T> | null {
  const current = state.patches[id]
  if (current && current.confirmedAt === undefined) return null
  return { ...state, patches: { ...state.patches, [id]: { token, readAt } } }
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

/**
 * A list response. Drops every patch (and the mark-all) confirmed before this
 * read started; unconfirmed patches and those confirmed later stay on top. A
 * response from a read started before the current list's read is ignored.
 */
export function receiveList<T extends ReadableRow>(state: ReadState<T>, items: T[], startedAt: number): ReadState<T> {
  if (state.list && startedAt < state.list.startedAt) return state
  const patches = Object.fromEntries(Object.entries(state.patches).filter(([, patch]) => !reflectedBy(patch, { startedAt })))
  const allRead = state.allRead && reflectedBy(state.allRead, { startedAt }) ? null : state.allRead
  return { ...state, list: { items, startedAt }, patches, allRead }
}

/** A count response; the later-started read wins. The deltas above handle what it reflects. */
export function receiveCount<T extends ReadableRow>(state: ReadState<T>, value: number, startedAt: number): ReadState<T> {
  if (state.count && startedAt < state.count.startedAt) return state
  return { ...state, count: { value, startedAt } }
}

/** True while this row's own patch is unconfirmed (its toggle is disabled). */
export function isPending<T extends ReadableRow>(state: ReadState<T>, id: string): boolean {
  const patch = state.patches[id]
  return patch !== undefined && patch.confirmedAt === undefined
}

/** True while a mark-all is unconfirmed (its button is disabled). */
export function isAllReadPending<T extends ReadableRow>(state: ReadState<T>): boolean {
  return state.allRead !== null && state.allRead.confirmedAt === undefined
}
