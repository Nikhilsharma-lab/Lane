"use client"

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import type { OverviewRequest } from "@/lib/request-overview"

/** The fields a pending lifecycle or priority move can change on a row. */
export type RequestPatch = Partial<Pick<OverviewRequest, "status" | "priority" | "assignedTo" | "assigneeName" | "assigneeAvatarUrl">> & {
  kind: "pick-up" | "done" | "undo" | "priority"
  /** performance.now() when the patch was applied; the no-revert gate reads it. */
  since: number
}

export type PendingMutations = {
  /** Patches keyed by Request id, applied on top of whatever the server rendered. */
  patches: Record<string, RequestPatch>
  /** Changes whose action has not answered yet. URL sync waits for these only: a confirmed
   * change on a row the server list never re-sends ("Show older Done") stays shown but holds nothing. */
  unconfirmed: number
  /** Returns the rows with every pending patch applied; identity is preserved for untouched rows. */
  apply<T extends { id: string }>(rows: T[]): T[]
  /** One row through the overlay, without composer inserts (the detail page). */
  applyOne<T extends { id: string }>(row: T): T
  /** Applies a patch in the same tick and returns its token. */
  begin(id: string, patch: Omit<RequestPatch, "since">): number
  /** The action succeeded: the patch now clears as soon as the server rows show it. */
  confirm(id: string, token: number): void
  /** The action failed: the patch goes and the server rows show through. */
  rollback(id: string, token: number): void
  /** A Request the composer just created, shown until the server rows include it. */
  insert(row: OverviewRequest): void
  /** Records the outcome (true = succeeded) of the latest action on a Request. */
  track(id: string, outcome: Promise<boolean>): void
  /** Resolves with whether the latest action on this Request succeeded; true when none is in flight. */
  settled(id: string): Promise<boolean>
}

type Field = "status" | "priority" | "assignedTo" | "assigneeName" | "assigneeAvatarUrl"
const FIELDS: Field[] = ["status", "priority", "assignedTo", "assigneeName", "assigneeAvatarUrl"]

/** One action's change to one Request. Later layers win; a layer clears on its own. */
type Layer = { token: number; patch: RequestPatch; confirmed: boolean }
type Insert = { row: OverviewRequest; since: number }
export type PendingSnapshot = { layers: Record<string, Layer[]>; inserts: Record<string, Insert> }

/** A composer insert the server lists never pick up (another Project's view, say) stops showing after this. */
const INSERT_TTL_MS = 2 * 60 * 1000

const fieldsOf = (patch: RequestPatch) => FIELDS.filter(field => patch[field] !== undefined)
const valueOf = (row: object, field: Field) => {
  const value = (row as Partial<Record<Field, unknown>>)[field]
  return field === "priority" ? value ?? "none" : value ?? null
}
/** The plan's rule: a patch is reflected once the server row shows its status or priority. */
function reflected(row: object, patch: RequestPatch) {
  const decisive = fieldsOf(patch).filter(field => field === "status" || field === "priority")
  const fields = decisive.length ? decisive : fieldsOf(patch)
  return fields.every(field => valueOf(row, field) === valueOf(patch, field))
}

/**
 * The overlay's state outside React, so it can be tested without a DOM and
 * shared by every consumer under the layout. `schedule` defers the clean-up a
 * render discovers (a patch the server rows now show) until after that render.
 */
export function createPendingMutationsStore({ schedule = queueMicrotask, now = () => performance.now(), clock = () => Date.now() }: {
  schedule?: (task: () => void) => void
  now?: () => number
  clock?: () => number
} = {}) {
  let snapshot: PendingSnapshot = { layers: {}, inserts: {} }
  let nextToken = 1
  const listeners = new Set<() => void>()
  const inflight = new Map<string, Promise<boolean>>()
  const scheduled = new Set<string>()
  // A patched row is rebuilt only when its server row or its layers change, so
  // repeated renders hand memoised rows the same object.
  const patchedRows = new WeakMap<object, { layers: Layer[]; row: object }>()

  function set(next: PendingSnapshot) {
    snapshot = next
    for (const listener of listeners) listener()
  }
  function setLayers(id: string, layers: Layer[]) {
    const next = { ...snapshot.layers }
    if (layers.length) next[id] = layers
    else delete next[id]
    set({ ...snapshot, layers: next })
  }

  function clearLater(key: string, task: () => void) {
    if (scheduled.has(key)) return
    scheduled.add(key)
    schedule(() => { scheduled.delete(key); task() })
  }

  function overlay<T extends { id: string }>(view: PendingSnapshot, row: T): T {
    const layers = view.layers[row.id]
    if (!layers) return row
    // Confirmed layers the server row now shows are done; anything else still overrides it.
    const live = layers.filter(layer => !(layer.confirmed && reflected(row, layer.patch)))
    for (const layer of layers) {
      if (live.includes(layer)) continue
      clearLater(`${row.id}:${layer.token}`, () => {
        const current = snapshot.layers[row.id]
        if (current?.some(item => item.token === layer.token)) setLayers(row.id, current.filter(item => item.token !== layer.token))
      })
    }
    if (!live.length) return row
    const cached = patchedRows.get(row)
    if (cached && cached.layers.length === live.length && cached.layers.every((layer, index) => layer === live[index])) return cached.row as T
    const patched = { ...row } as T & Partial<Record<Field, unknown>>
    for (const layer of live) for (const field of fieldsOf(layer.patch)) patched[field] = layer.patch[field]
    patchedRows.set(row, { layers: live, row: patched })
    return patched
  }

  function view(current: PendingSnapshot): PendingMutations {
    const patches: Record<string, RequestPatch> = {}
    let unconfirmed = 0
    for (const [id, layers] of Object.entries(current.layers)) {
      patches[id] = layers.reduce<RequestPatch>((merged, layer) => ({ ...merged, ...layer.patch }), layers[0].patch)
      unconfirmed += layers.filter(layer => !layer.confirmed).length
    }
    return {
      patches,
      unconfirmed,
      applyOne: row => overlay(current, row),
      apply<T extends { id: string }>(rows: T[]): T[] {
        let changed = false
        const out = rows.map(row => {
          const next = overlay(current, row)
          if (next !== row) changed = true
          return next
        })
        const present = new Set(rows.map(row => row.id))
        const added: T[] = []
        for (const [id, insert] of Object.entries(current.inserts)) {
          const expired = clock() - insert.since > INSERT_TTL_MS
          if (present.has(id) || expired) {
            clearLater(`insert:${id}:${insert.since}`, () => {
              if (snapshot.inserts[id] !== insert) return
              const inserts = { ...snapshot.inserts }
              delete inserts[id]
              set({ ...snapshot, inserts })
            })
            continue
          }
          // Only list-shaped callers receive composer inserts; the row type is the list's.
          added.push(overlay(current, insert.row as unknown as T))
        }
        return changed || added.length ? [...added, ...out] : rows
      },
      begin,
      confirm,
      rollback,
      insert,
      track,
      settled,
    }
  }

  function begin(id: string, patch: Omit<RequestPatch, "since">) {
    const token = nextToken++
    const layer: Layer = { token, patch: { ...patch, since: now() } as RequestPatch, confirmed: false }
    const fields = fieldsOf(layer.patch)
    // The newest move owns the fields it sets: an Undo over a Done must not
    // fall back to Done when the Undo clears first.
    const older = (snapshot.layers[id] ?? []).flatMap(item => {
      const kept = fieldsOf(item.patch).filter(field => !fields.includes(field))
      if (!kept.length) return []
      if (kept.length === fieldsOf(item.patch).length) return [item]
      const trimmed = { ...item.patch }
      for (const field of fields) delete trimmed[field]
      return [{ ...item, patch: trimmed }]
    })
    setLayers(id, [...older, layer])
    return token
  }

  function confirm(id: string, token: number) {
    const layers = snapshot.layers[id]
    if (!layers?.some(layer => layer.token === token && !layer.confirmed)) return
    setLayers(id, layers.map(layer => layer.token === token ? { ...layer, confirmed: true } : layer))
  }

  function rollback(id: string, token: number) {
    const layers = snapshot.layers[id]
    if (!layers?.some(layer => layer.token === token)) return
    setLayers(id, layers.filter(layer => layer.token !== token))
  }

  function insert(row: OverviewRequest) {
    set({ ...snapshot, inserts: { ...snapshot.inserts, [row.id]: { row, since: clock() } } })
  }

  function track(id: string, outcome: Promise<boolean>) {
    const settledOutcome = outcome.catch(() => false)
    inflight.set(id, settledOutcome)
    void settledOutcome.then(() => { if (inflight.get(id) === settledOutcome) inflight.delete(id) })
  }

  function settled(id: string) {
    return inflight.get(id) ?? Promise.resolve(true)
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    view,
  }
}

export type PendingMutationsStore = ReturnType<typeof createPendingMutationsStore>

/**
 * One pending-mutation overlay at layout level (plan item 1.5). The list,
 * detail, summary, counts and the composer insert read through it, so a
 * change shows in the next frame and never visibly reverts: a patch clears
 * only when its action succeeded and the server rows show it, or when the
 * action fails. It never clears on transition end, because Next discards an
 * action's revalidated payload when a navigation lands while it is pending.
 */
const PendingMutationsContext = createContext<PendingMutations | null>(null)

/** The overlay's write side. Its functions keep their identity for the provider's life. */
export type PendingMutationWriter = Pick<PendingMutations, "begin" | "confirm" | "rollback" | "insert" | "track" | "settled">
const PendingMutationWriterContext = createContext<PendingMutationWriter | null>(null)

export function PendingMutationsProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createPendingMutationsStore())
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const value = useMemo(() => store.view(snapshot), [store, snapshot])
  // Components that only start mutations read this one and never re-render on a patch.
  const [writer] = useState<PendingMutationWriter>(() => {
    const { begin, confirm, rollback, insert, track, settled } = store.view(store.getSnapshot())
    return { begin, confirm, rollback, insert, track, settled }
  })
  return <PendingMutationWriterContext.Provider value={writer}>
    <PendingMutationsContext.Provider value={value}>{children}</PendingMutationsContext.Provider>
  </PendingMutationWriterContext.Provider>
}

/** Null outside the provider (older fixtures); consumers fall back to the server rows. */
export const usePendingMutations = () => useContext(PendingMutationsContext)

/** Null outside the provider; mutations then run without an overlay. */
export const usePendingMutationWriter = () => useContext(PendingMutationWriterContext)
