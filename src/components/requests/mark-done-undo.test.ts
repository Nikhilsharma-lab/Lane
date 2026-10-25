import { describe, expect, it, vi } from "vitest"
import { toastStack } from "@/test/toast-stack"
import { createMarkDoneUndoStore, showMarkedDone } from "./mark-done-undo"

function app(limit?: number) {
  const stack = toastStack(limit)
  const store = createMarkDoneUndoStore()
  const disconnect = store.bind(stack.state)
  const undo = vi.fn()
  const mark = (id = "r1", name = "LAN-12") => showMarkedDone(stack.toast, { id, name }, undo, store)
  return { stack, store, undo, mark, disconnect }
}

describe("single-Request Undo follows actual Arc toast state", () => {
  it("shows Marked Done with the existing lifetime and latest palette pointer", () => {
    const a = app()
    const { toastId } = a.mark()
    expect(a.stack.toasts[0]).toMatchObject({ id: toastId, type: "success", title: "Marked Done", description: "LAN-12 is now Done.", duration: 10_000, action: { label: "Undo" } })
    expect(a.store.get()).toMatchObject({ toastId, requestId: "r1", name: "LAN-12" })
  })

  it.each(["toast", "palette"])("consumes one operation when %s runs before the other retained entry point", first => {
    const a = app()
    const { toastId: id } = a.mark()
    const palette = a.store.get()!.undo
    const toast = () => a.stack.toasts[0].action!.onClick(id)
    if (first === "toast") { toast(); palette() } else { palette(); toast() }
    expect(a.undo).toHaveBeenCalledExactlyOnceWith(id, "r1", "LAN-12")
    expect(a.store.get()).toBeNull()
  })

  it.each(["dismiss", "dismiss-all", "action removal", "replacement", "eviction"])("%s ends eligibility immediately and retained callbacks cannot submit", change => {
    const a = app(2)
    const { toastId: id } = a.mark()
    const retained = a.store.get()!.undo
    const action = a.stack.toasts[0].action!.onClick
    if (change === "dismiss") a.stack.dismiss(id)
    else if (change === "dismiss-all") a.stack.dismiss()
    else if (change === "action removal") a.stack.update(id, { action: undefined })
    else if (change === "replacement") a.stack.toast({ id, title: "Another operation", action: { label: "Open", onClick: vi.fn() } })
    else { a.stack.toast({ title: "Second" }); a.stack.toast({ title: "Third" }) }
    expect(a.store.get()).toBeNull()
    retained()
    action(id)
    expect(a.undo).not.toHaveBeenCalled()
  })

  it("unrelated removal and changed copy do not control availability", () => {
    const a = app()
    const { toastId: id } = a.mark()
    const pointer = a.store.get()
    const unrelated = a.stack.toast({ title: "Other message" })
    a.stack.dismiss(unrelated)
    a.stack.update(id, { title: "Finished", description: "Different copy", duration: 25 })
    expect(a.store.get()).toBe(pointer)
    pointer!.undo()
    expect(a.undo).toHaveBeenCalledOnce()
  })

  it("the same callback copied onto a different toast cannot consume the original operation", () => {
    const a = app()
    const done = a.mark()
    const action = a.stack.toasts[0].action!
    const other = a.stack.toast({ title: "Another toast", action })
    action.onClick(other)
    expect(a.undo).not.toHaveBeenCalled()
    expect(a.store.get()?.toastId).toBe(done.toastId)
  })

  it("keeps older visible toast actions without falling back after the latest ends", () => {
    const a = app()
    const first = a.mark()
    const firstAction = a.stack.toasts[0].action!.onClick
    const second = a.mark("r2", "LAN-13")
    expect(a.store.get()?.requestId).toBe("r2")
    firstAction(first.toastId)
    expect(a.undo).toHaveBeenCalledExactlyOnceWith(first.toastId, "r1", "LAN-12")
    expect(a.store.get()?.requestId).toBe("r2")
    a.stack.dismiss(second.toastId)
    expect(a.store.get()).toBeNull()
  })

  it("a failed Done clears only its own pointer", () => {
    const a = app()
    const first = a.mark()
    const second = a.mark("r2", "LAN-13")
    first.end()
    expect(a.store.get()?.requestId).toBe("r2")
    second.end()
    expect(a.store.get()).toBeNull()
    a.stack.toasts[0].action!.onClick(second.toastId)
    second.restore()
    expect(a.undo).not.toHaveBeenCalled()
  })

  it("restoring an older Done never displaces the newer palette operation", () => {
    const a = app()
    const first = a.mark()
    const newer = a.mark("r2", "LAN-13")
    first.restore()
    expect(a.store.get()?.requestId).toBe("r2")
    newer.end()
    first.restore()
    expect(a.store.get()).toBeNull()
    a.stack.toasts.find(toast => toast.id === first.toastId)!.action!.onClick(first.toastId)
    expect(a.undo).toHaveBeenCalledExactlyOnceWith(first.toastId, "r1", "LAN-12")
  })

  it("unbinding stops eligibility, and rebinding reconciles current actual state", () => {
    const a = app()
    const { toastId: id } = a.mark()
    const retained = a.store.get()!.undo
    a.disconnect()
    retained()
    expect(a.undo).not.toHaveBeenCalled()
    expect(a.store.get()).toBeNull()
    a.stack.dismiss(id)
    a.store.bind(a.stack.state)
    expect(a.store.get()).toBeNull()
  })

  it("an older provider lifetime cannot clear the newer operation with the same local toast id", () => {
    const a = app()
    const older = a.mark()
    a.disconnect()
    const nextStack = toastStack()
    a.store.bind(nextStack.state)
    showMarkedDone(nextStack.toast, { id: "r2", name: "LAN-13" }, a.undo, a.store)
    older.end()
    expect(a.store.get()?.requestId).toBe("r2")
  })
})
