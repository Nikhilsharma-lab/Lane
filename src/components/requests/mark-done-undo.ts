"use client"

import { useLayoutEffect, useSyncExternalStore } from "react"
import { useToastStackState, type ToastStackApi, type ToastStackState } from "@/components/arc/toast-stack/toast-stack"
import { createExternalStore } from "@/lib/external-store"

/** #103: the latest Mark Done, while its toast still offers Undo. `undo` is that toast's own Undo. */
export type UndoableMarkDone = { toastId: string; requestId: string; name: string; undo: () => void }

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

/**
 * Mark Done's confirmation: "Marked Done" with Undo for 10 seconds (paused while the stack is
 * open or the tab hidden). The pointer keeps the same Undo callback the toast's action calls.
 * The returned handle restores that same operation after "Not yet", without making it newer.
 */
export function showMarkedDone(toast: ToastStackApi["toast"], request: { id: string; name: string },
  undo: (toastId: string, requestId: string, name: string) => void | Promise<void>, store: MarkDoneUndoStore = markDoneUndo) {
  const { id: requestId, name } = request
  let consumed = false
  let ended = false
  const runUndo = (id: string) => {
    if (id !== toastId || consumed || ended || !store.eligible(toastId, runUndo)) return
    consumed = true
    store.clear(runUndo)
    void undo(id, requestId, name)
  }
  const show = (id?: string) => toast({ id, type: "success", title: "Marked Done", description: markedDoneDescription(name), duration: 10_000, action: { label: "Undo", onClick: runUndo } })
  const toastId = show()
  store.set({ toastId, requestId, name, undo: () => runUndo(toastId) }, runUndo)
  return {
    toastId,
    get consumed() { return consumed },
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
