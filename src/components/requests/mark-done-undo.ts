"use client"

import { useLayoutEffect, useSyncExternalStore } from "react"
import { useToastStackState, type ToastStackApi, type ToastStackState } from "@/components/arc/toast-stack/toast-stack"
import { createExternalStore } from "@/lib/external-store"

/**
 * How long a change's message offers Undo: Mark Done, removing a reviewer, taking a Request out of a Same problem
 * group (undo-toast.ts). It lives here, with the app-wide Mark Done, so no page loads more to read it.
 */
export const UNDO_MS = 10_000

/** How an undo of Mark Done was asked for: the toast's (or palette's) Undo, or the Done step's Reopen (#278). */
export type UndoKind = "undo" | "reopen"

/** #103: the latest Mark Done, while its toast still offers Undo. `undo` is that toast's own Undo. */
export type UndoableMarkDone = { toastId: string; requestId: string; name: string; undo: (kind?: UndoKind) => void | Promise<void> }

/** Latest single-Request Done, observed through the actual Arc queue rather than its rendering. */
export function createMarkDoneUndoStore() {
  const store = createExternalStore<UndoableMarkDone | null>(null)
  let source: ToastStackState | null = null
  let current: { pointer: UndoableMarkDone; action: (id: string) => void } | null = null
  const eligible = (id: string, action: (id: string) => void) =>
    source?.getSnapshot().some(toast => toast.id === id && toast.action?.onClick === action) ?? false
  const reconcile = () => {
    const next = current && eligible(current.pointer.toastId, current.action) ? current.pointer : null
    if (store.get() !== next) store.set(next)
  }
  return {
    get: store.get,
    subscribe: store.subscribe,
    eligible,
    bind: (next: ToastStackState) => {
      source = next
      const unsubscribe = next.subscribe(reconcile)
      reconcile()
      return () => {
        unsubscribe()
        if (source === next) { source = null; reconcile() }
      }
    },
    set: (pointer: UndoableMarkDone, action: (id: string) => void) => { current = { pointer, action }; reconcile() },
    clear: (action: (id: string) => void) => {
      if (current?.action === action) { current = null; reconcile() }
    },
  }
}

// Only a Marked Done toast reads this; Undoing and a failure replace it.
const markedDoneDescription = (name: string) => `${name} is now Done.`

export type MarkDoneUndoStore = ReturnType<typeof createMarkDoneUndoStore>

// One pointer for the app: every Mark Done toast goes to the root layout's one stack.
const markDoneUndo = createMarkDoneUndoStore()
/** The app's one pointer, for the moves that end it (Reopen). */
export const appMarkDoneUndo = markDoneUndo

/**
 * Mark Done's confirmation: "Marked Done" with Undo for 10 seconds (paused while the stack is
 * open or the tab hidden). The pointer keeps the same Undo callback the toast's action calls.
 * The returned handle restores that same operation after "Not yet", without making it newer.
 */
export function showMarkedDone(toast: ToastStackApi["toast"], request: { id: string; name: string },
  undo: (toastId: string, requestId: string, name: string, kind: UndoKind) => void | Promise<void>, store: MarkDoneUndoStore = markDoneUndo) {
  const { id: requestId, name } = request
  let consumed = false
  let ended = false
  const runUndo = (id: string, kind: UndoKind = "undo") => {
    if (id !== toastId || consumed || ended || !store.eligible(toastId, runUndo)) return
    consumed = true
    store.clear(runUndo)
    return undo(id, requestId, name, kind)
  }
  const show = (id?: string) => toast({ id, type: "success", title: "Marked Done", description: markedDoneDescription(name), duration: UNDO_MS, action: { label: "Undo", onClick: runUndo } })
  const toastId = show()
  store.set({ toastId, requestId, name, undo: (kind?: UndoKind) => runUndo(toastId, kind) }, runUndo)
  return {
    toastId,
    get consumed() { return consumed },
    get ended() { return ended },
    restore: () => { if (!consumed && !ended) show(toastId) },
    end: () => { ended = true; store.clear(runUndo) },
  }
}

/** The latest Mark Done while its toast still shows Undo, else null. Needs `MarkDoneUndoWatcher` mounted. */
export function useUndoableMarkDone(store: MarkDoneUndoStore = markDoneUndo): UndoableMarkDone | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/** Mounted once under the root Arc provider; every queue commit reconciles eligibility immediately. */
export function MarkDoneUndoWatcher({ store = markDoneUndo }: { store?: MarkDoneUndoStore }) {
  const source = useToastStackState()
  useLayoutEffect(() => store.bind(source), [store, source])
  return null
}
