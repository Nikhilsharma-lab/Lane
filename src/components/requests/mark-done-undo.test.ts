import { describe, expect, it, vi } from "vitest"
import type { ToastOptions, ToastStackApi } from "@/components/arc/toast-stack/toast-stack"
import { clearMarkedDone, createMarkDoneUndoStore, showMarkedDone } from "./mark-done-undo"

function markDone(store = createMarkDoneUndoStore(), request = { id: "r1", name: "LAN-12" }, toastId = "toast-7") {
  const shown: ToastOptions[] = []
  const toast = vi.fn<ToastStackApi["toast"]>(options => { shown.push(options); return toastId })
  const undo = vi.fn(async () => {})
  showMarkedDone(toast, request, undo, store)
  return { store, undo, toast: shown[0] }
}

describe("the undoable Mark Done (#103)", () => {
  it("shows Marked Done with Undo and points at it", () => {
    const { store, toast } = markDone()
    expect(toast).toMatchObject({ type: "success", title: "Marked Done", description: "LAN-12 is now Done.", duration: 10_000, action: { label: "Undo" } })
    expect(store.get()).toMatchObject({ toastId: "toast-7", requestId: "r1", name: "LAN-12" })
  })

  it("runs the toast's own Undo from the palette, once, and then is gone", () => {
    const { store, undo } = markDone()
    store.get()!.undo()
    expect(undo).toHaveBeenCalledExactlyOnceWith("toast-7", "r1", "LAN-12")
    expect(store.get()).toBeNull()
  })

  it("is gone once the toast's Undo button runs the same callback", () => {
    const { store, undo, toast } = markDone()
    toast.action!.onClick("toast-7")
    expect(undo).toHaveBeenCalledExactlyOnceWith("toast-7", "r1", "LAN-12")
    expect(store.get()).toBeNull()
  })

  it("is gone once the Done fails, but a failure of an older Done leaves the latest", () => {
    const { store } = markDone()
    clearMarkedDone("toast-7", store)
    expect(store.get()).toBeNull()
    markDone(store, { id: "r2", name: "LAN-13" }, "toast-8")
    clearMarkedDone("toast-7", store)
    expect(store.get()?.name).toBe("LAN-13")
  })

  it("is gone once the toast queue shrinks: its toast dismissed, swiped or timed out", () => {
    const { store } = markDone()
    store.observe(2)
    store.observe(3)
    expect(store.get()?.name).toBe("LAN-12")
    store.observe(2)
    expect(store.get()).toBeNull()
  })

  it("watches the queue afresh for each Mark Done, and only the latest counts", () => {
    const { store } = markDone()
    store.observe(1)
    markDone(store, { id: "r2", name: "LAN-13" }, "toast-8")
    store.observe(2)
    expect(store.get()?.name).toBe("LAN-13")
    store.observe(1)
    expect(store.get()).toBeNull()
  })
})
