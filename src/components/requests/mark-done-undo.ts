"use client"

import { useLayoutEffect, useSyncExternalStore } from "react"
import { useToastStack, type ToastStackApi } from "@/components/arc/toast-stack/toast-stack"

/** #103: the latest Mark Done, while its toast still offers Undo. `undo` is that toast's own Undo. */
export type UndoableMarkDone = { toastId: string; requestId: string; name: string; undo: () => void }

/**
 * The pointer to the latest Mark Done. Arc's toast stack exposes no dismiss or
 * timeout callback and no per-toast state, only how many toasts are queued, so
 * the pointer clears when Undo runs (from the toast or the palette), when the
 * Done fails, and when the queue shrinks at all while it is set: its own toast
 * closing (dismissed, swiped, timed out) always shrinks it. Another toast
 * closing in the same 10 seconds also clears it, so the palette can stop
 * offering Undo early but never offers it after the toast's Undo is gone.
 */
export function createMarkDoneUndoStore() {
  let latest: UndoableMarkDone | null = null
  let queued: number | null = null
  const listeners = new Set<() => void>()
  const commit = (next: UndoableMarkDone | null) => { latest = next; queued = null; listeners.forEach(listener => listener()) }
  return {
    get: () => latest,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: (pointer: UndoableMarkDone) => commit(pointer),
    /** Clears the pointer if it is still this toast's. */
    clear: (toastId: string) => { if (latest?.toastId === toastId) commit(null) },
    /** Reports the toast stack's queue length; a smaller queue than last seen clears the pointer. */
    observe: (count: number) => {
      if (!latest) return
      if (queued !== null && count < queued) commit(null)
      else queued = count
    },
  }
}

export type MarkDoneUndoStore = ReturnType<typeof createMarkDoneUndoStore>

// One pointer for the app: every Mark Done toast goes to the root layout's one stack.
const markDoneUndo = createMarkDoneUndoStore()

/**
 * Mark Done's confirmation: "Marked Done" with Undo for 10 seconds (paused while the stack is
 * open or the tab hidden). The pointer keeps the same Undo callback the toast's action calls.
 */
export function showMarkedDone(toast: ToastStackApi["toast"], request: { id: string; name: string },
  undo: (toastId: string, requestId: string, name: string) => void | Promise<void>, store: MarkDoneUndoStore = markDoneUndo): string {
  const { id: requestId, name } = request
  const runUndo = (id: string) => { store.clear(id); void undo(id, requestId, name) }
  const toastId = toast({ type: "success", title: "Marked Done", description: `${name} is now Done.`, duration: 10_000, action: { label: "Undo", onClick: runUndo } })
  store.set({ toastId, requestId, name, undo: () => runUndo(toastId) })
  return toastId
}

/** A Mark Done that failed: its toast now shows the failure, so Undo is gone. */
export function clearMarkedDone(toastId: string, store: MarkDoneUndoStore = markDoneUndo) {
  store.clear(toastId)
}

/** The latest Mark Done while its toast still shows Undo, else null. Needs `MarkDoneUndoWatcher` mounted. */
export function useUndoableMarkDone(store: MarkDoneUndoStore = markDoneUndo): UndoableMarkDone | null {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/** Mounted once in the authenticated layout: tells the pointer when the toast queue shrinks. Renders nothing. */
export function MarkDoneUndoWatcher({ store = markDoneUndo }: { store?: MarkDoneUndoStore }) {
  const { count } = useToastStack()
  useLayoutEffect(() => { store.observe(count) }, [store, count])
  return null
}
