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

  it("is gone once its own toast closes: dismissed, swiped or timed out", () => {
    const { store } = markDone()
    store.observe(2)
    store.observe(3)
    expect(store.get()?.name).toBe("LAN-12")
    expect(store.observe(2)).toBe(true)
    store.settle("Error: Could not copy Select the text and copy it instead.")
    expect(store.get()).toBeNull()
  })

  it("stays when another toast closes, such as a copy failure", () => {
    const { store } = markDone()
    store.observe(1)
    store.observe(2)
    expect(store.observe(1)).toBe(true)
    store.settle("Success: Marked Done LAN-12 is now Done. Undo Dismiss notification")
    expect(store.get()?.name).toBe("LAN-12")
    // A later close of its own toast still clears it.
    expect(store.observe(0)).toBe(true)
    store.settle("")
    expect(store.get()).toBeNull()
  })

  it("is gone when no stack is on the page to show it", () => {
    const { store } = markDone()
    store.settle(null)
    expect(store.get()).toBeNull()
  })

  it("does not take a toast that has moved on (Undoing, a failure) or another Request's for it", () => {
    const { store } = markDone()
    store.settle("Loading: Undoing LAN-12 is moving back to In Progress.")
    expect(store.get()).toBeNull()
    markDone(store)
    store.settle("Success: Marked Done LAN-13 is now Done. Undo")
    expect(store.get()).toBeNull()
  })

  it("asks for no check while the queue grows, or with nothing to undo", () => {
    const store = createMarkDoneUndoStore()
    expect(store.observe(2)).toBe(false)
    expect(store.observe(1)).toBe(false)
    markDone(store)
    expect(store.observe(1)).toBe(false)
    expect(store.observe(2)).toBe(false)
  })

  it("watches the queue afresh for each Mark Done, and only the latest counts", () => {
    const { store } = markDone()
    store.observe(1)
    markDone(store, { id: "r2", name: "LAN-13" }, "toast-8")
    expect(store.observe(2)).toBe(false)
    expect(store.get()?.name).toBe("LAN-13")
    expect(store.observe(1)).toBe(true)
    store.settle("Success: Marked Done LAN-12 is now Done. Undo")
    expect(store.get()).toBeNull()
  })
})
