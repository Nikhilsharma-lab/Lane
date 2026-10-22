import { describe, expect, it, vi } from "vitest"
import type { ToastOptions, ToastStackApi } from "@/components/arc/toast-stack/toast-stack"
import { clearMarkedDone, createMarkDoneUndoStore, markedDoneQueued, showMarkedDone } from "./mark-done-undo"

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
    store.settle(false)
    expect(store.get()).toBeNull()
  })

  it("stays when another toast closes, such as a copy failure", () => {
    const { store } = markDone()
    store.observe(1)
    store.observe(2)
    expect(store.observe(1)).toBe(true)
    // Until the stack has settled, the palette does not offer an Undo that may be gone.
    expect(store.get()).toBeNull()
    store.settle(true)
    expect(store.get()?.name).toBe("LAN-12")
    // A later close of its own toast still clears it.
    expect(store.observe(0)).toBe(true)
    store.settle(false)
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
    store.observe(2)
    expect(store.get()?.name).toBe("LAN-13")
    expect(store.observe(1)).toBe(true)
    store.settle(false)
    expect(store.get()).toBeNull()
  })

  it("keeps asking while a check is open, even as a new toast arrives", () => {
    const { store } = markDone()
    store.observe(2)
    expect(store.observe(1)).toBe(true)
    expect(store.observe(2)).toBe(true)
    store.settle(true)
    expect(store.get()?.name).toBe("LAN-12")
    expect(store.observe(3)).toBe(false)
  })

  it("ignores a check that a new Mark Done or an Undo overtook", () => {
    const { store } = markDone()
    store.observe(2)
    store.observe(1)
    markDone(store, { id: "r2", name: "LAN-13" }, "toast-8")
    store.settle(false)
    expect(store.get()?.name).toBe("LAN-13")
  })
})

describe("finding the Marked Done toast once the stack settles (#103)", () => {
  const pointer = { name: "LAN-12" }
  const item = (text: string) => ({ textContent: text })

  it("waits while a closed toast is still leaving the list", () => {
    expect(markedDoneQueued([item("Success: Marked Done LAN-12 is now Done. Undo"), item("Error: Could not copy")], 1, pointer)).toBe("pending")
  })

  it("finds its toast among those still queued", () => {
    expect(markedDoneQueued([item("Success: Marked Done LAN-12 is now Done. Undo")], 1, pointer)).toBe(true)
    expect(markedDoneQueued([item("Error: Could not copy")], 1, pointer)).toBe(false)
    expect(markedDoneQueued([item("Success: Marked Done LAN-13 is now Done. Undo")], 1, pointer)).toBe(false)
  })

  it("does not take a toast that has moved on (Undoing, a failure) for it", () => {
    expect(markedDoneQueued([item("Loading: Undoing LAN-12 is moving back to In Progress.")], 1, pointer)).toBe(false)
  })
})
