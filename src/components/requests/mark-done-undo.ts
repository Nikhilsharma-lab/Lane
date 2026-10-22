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
 * watcher answers with `settle` once the stack has settled: another toast
 * closing leaves the pointer. While a check is open the palette offers no
 * Undo, so it never offers one after the toast's Undo is gone.
 */
export function createMarkDoneUndoStore() {
  // `checking` is the pointer whose toast may have closed, until the watcher settles it.
  const store = createExternalStore<{ latest: UndoableMarkDone | null; checking: UndoableMarkDone | null }>({ latest: null, checking: null })
  let queued: number | null = null
  const commit = (latest: UndoableMarkDone | null) => { queued = null; store.set({ latest, checking: null }) }
  return {
    get: () => store.get().checking ? null : store.get().latest,
    subscribe: store.subscribe,
    set: (pointer: UndoableMarkDone) => commit(pointer),
    /** Clears the pointer if it is still this toast's. */
    clear: (toastId: string) => { if (store.get().latest?.toastId === toastId) commit(null) },
    /** The pointer being checked, for the watcher to look for. */
    checking: () => store.get().checking,
    /** Reports the toast stack's queue length. True when it shrank and the watcher must `settle` whether the toast is still queued. */
    observe: (count: number): boolean => {
      const { latest, checking } = store.get()
      if (!latest) return false
      const shrank = queued !== null && count < queued
      queued = count
      if (shrank && !checking) store.set({ latest, checking: latest })
      // An open check is asked again with each new count, since the watcher compares the stack against it.
      return store.get().checking !== null
    },
    /** The watcher's answer: whether the checked toast is still queued. Ignored if a new Mark Done or an Undo overtook it. */
    settle: (present: boolean) => {
      const { latest, checking } = store.get()
      if (!checking || checking !== latest) return
      if (present) store.set({ latest, checking: null })
      else commit(null)
    },
  }
}

const markedDoneDescription = (name: string) => `${name} is now Done.`

/**
 * Whether the Marked Done toast is still queued, from the stack's rendered
 * items: "pending" while a closed toast is still leaving (more items than
 * queued toasts). Its toast is the one still reading "Marked Done" for its
 * Request; one that moved on (Undoing, a failure) no longer offers Undo.
 */
export function markedDoneQueued(items: ArrayLike<{ textContent: string | null }>, count: number, pointer: { name: string }): boolean | "pending" {
  if (items.length > count) return "pending"
  return Array.from(items).some(item => {
    const text = item.textContent ?? ""
    return text.includes("Marked Done") && text.includes(markedDoneDescription(pointer.name))
  })
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
  const toastId = toast({ type: "success", title: "Marked Done", description: markedDoneDescription(name), duration: 10_000, action: { label: "Undo", onClick: runUndo } })
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

// The root layout's one stack ("Messages (Alt+T)", src/app/layout.tsx); Arc draws each toast as an item of its list.
const TOAST_LIST = 'section[aria-label^="Messages"][aria-live="polite"] > ol'

/** Answers the store's check once the stack's leaving toasts are gone; with no stack on the page the toast is gone too. */
function settleWhenStackSettles(store: MarkDoneUndoStore, count: number) {
  const list = document.querySelector(TOAST_LIST)
  const pointer = store.checking()
  if (!list || !pointer) { store.settle(false); return () => {} }
  const check = () => {
    const found = markedDoneQueued(list.children, count, pointer)
    if (found === "pending") return false
    store.settle(found)
    return true
  }
  if (check()) return () => {}
  const observer = new MutationObserver(() => { if (check()) observer.disconnect() })
  observer.observe(list, { childList: true })
  return () => observer.disconnect()
}

/** Mounted once in the authenticated layout: tells the pointer when the toast queue shrinks, and whether its toast is still there. Renders nothing. */
export function MarkDoneUndoWatcher({ store = markDoneUndo }: { store?: MarkDoneUndoStore }) {
  const { count } = useToastStack()
  useLayoutEffect(() => store.observe(count) ? settleWhenStackSettles(store, count) : undefined, [store, count])
  return null
}
