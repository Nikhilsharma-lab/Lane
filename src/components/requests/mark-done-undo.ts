"use client"

import { useSyncExternalStore } from "react"
import { useToastAction, type ToastAction, type ToastStackApi } from "@/components/arc/toast-stack/toast-stack"

/** #103: the latest Mark Done, while its toast still offers Undo. `undo` runs that toast's own Undo. */
export type UndoableMarkDone = { toastId: string; requestId: string; name: string; undo: () => void }
type Pointer = UndoableMarkDone & { action: ToastAction }

// One pointer for the app: Mark Done toasts share the root layout's one stack, and only the latest counts.
let latest: Pointer | null = null
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const read = () => latest

/**
 * Mark Done's confirmation: "Marked Done" with Undo for 10 seconds (paused while the stack is open
 * or the tab hidden). It also becomes the latest Mark Done, so the palette's Undo runs the same action.
 */
export function showMarkedDone(toast: ToastStackApi["toast"], request: { id: string; name: string },
  undo: (toastId: string, requestId: string, name: string) => void | Promise<void>): string {
  const { id: requestId, name } = request
  const action: ToastAction = { label: "Undo", onClick: id => void undo(id, requestId, name) }
  const toastId = toast({ type: "success", title: "Marked Done", description: `${name} is now Done.`, duration: 10_000, action })
  latest = { toastId, requestId, name, action, undo: () => action.onClick(toastId) }
  listeners.forEach(listener => listener())
  return toastId
}

/** The latest Mark Done while its toast still shows Undo; null once Undo is pressed, the Done fails, or the toast closes. */
export function useUndoableMarkDone(): UndoableMarkDone | null {
  const pointer = useSyncExternalStore(subscribe, read, read)
  const action = useToastAction(pointer?.toastId ?? null)
  return pointer && action === pointer.action ? pointer : null
}
