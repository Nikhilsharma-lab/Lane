"use client"

import { useLayoutEffect, useSyncExternalStore } from "react"
import { useToastStack, type ToastStackApi } from "@/components/arc/toast-stack/toast-stack"
import { createExternalStore } from "@/lib/external-store"

/** #103: the latest Mark Done, while its toast still offers Undo. `undo` is that toast's own Undo. */
export type UndoableMarkDone = { toastId: string; requestId: string; name: string; undo: () => void }

/**
 * The pointer to the latest Mark Done. It clears when Undo runs (from the
 * toast or the palette), when the Done fails, and when its own toast closes
 * (dismissed, swiped, timed out). Arc's toast stack exposes no dismiss or
 * timeout callback and no per-toast state, only how many toasts are queued,
 * so a smaller queue asks for a check (`observe` returns true) and the
 * watcher reports the stack's text once the closed toast has left (`settle`):
 * another toast closing leaves the pointer. In that moment the palette may
 * still offer Undo; it runs the same callback, and its result toast replaces
 * the closed one.
 */
export function createMarkDoneUndoStore() {
  const store = createExternalStore<UndoableMarkDone | null>(null)
  let queued: number | null = null
  const commit = (next: UndoableMarkDone | null) => { queued = null; store.set(next) }
  return {
    get: store.get,
    subscribe: store.subscribe,
    set: (pointer: UndoableMarkDone) => commit(pointer),
    /** Clears the pointer if it is still this toast's. */
    clear: (toastId: string) => { if (store.get()?.toastId === toastId) commit(null) },
    /** Reports the toast stack's queue length. True when it shrank while a Mark Done is undoable: the watcher then calls `settle`. */
    observe: (count: number) => {
      const shrank = store.get() !== null && queued !== null && count < queued
      if (store.get()) queued = count
      return shrank
    },
    /** The stack's text once it has settled (null with no stack): the pointer stays only while its Marked Done toast is in it. */
    settle: (stackText: string | null | undefined) => {
      const latest = store.get()
      if (latest && !stackText?.includes(markedDoneDescription(latest.name))) commit(null)
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
 * Passing an earlier toast's id shows it again with a fresh 10 seconds (#135: after "Not yet").
 */
export function showMarkedDone(toast: ToastStackApi["toast"], request: { id: string; name: string },
  undo: (toastId: string, requestId: string, name: string) => void | Promise<void>, store: MarkDoneUndoStore = markDoneUndo, again?: string): string {
  const { id: requestId, name } = request
  const runUndo = (id: string) => { store.clear(id); void undo(id, requestId, name) }
  const toastId = toast({ id: again, type: "success", title: "Marked Done", description: markedDoneDescription(name), duration: 10_000, action: { label: "Undo", onClick: runUndo } })
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

// The root layout's one stack ("Messages (Alt+T)", src/app/layout.tsx). Arc's longest exit (a swipe) is 220 ms.
const TOAST_LIST = 'section[aria-label^="Messages"] > ol'
const EXIT_MS = 400

/** Mounted once in the authenticated layout: tells the pointer when the toast queue shrinks, and whether its toast is still there. Renders nothing. */
export function MarkDoneUndoWatcher({ store = markDoneUndo }: { store?: MarkDoneUndoStore }) {
  const { count } = useToastStack()
  useLayoutEffect(() => {
    // Not cancelled by a later count: a new toast must not stop the check of one that closed.
    if (store.observe(count)) window.setTimeout(() => store.settle(document.querySelector(TOAST_LIST)?.textContent), EXIT_MS)
  }, [store, count])
  return null
}
