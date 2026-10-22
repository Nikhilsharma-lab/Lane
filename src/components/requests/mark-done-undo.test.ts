import { createElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ToastStackProvider, useToastStack, type ToastStackApi } from "@/components/arc/toast-stack/toast-stack"
import { showMarkedDone, useUndoableMarkDone } from "./mark-done-undo"

type Api = ToastStackApi & { count: number }
type Step = (api: Api) => void

/** Renders the steps in order under one toast stack; each `read` records what useUndoableMarkDone returns at that point. */
function run(...steps: (Step | "read")[]) {
  const seen: (string | null)[] = []
  const Act = ({ step }: { step: Step }) => { step(useToastStack()); return null }
  const Read = () => { seen.push(useUndoableMarkDone()?.name ?? null); return null }
  const children: ReactNode[] = steps.map((step, index) => step === "read" ? createElement(Read, { key: index }) : createElement(Act, { key: index, step }))
  renderToStaticMarkup(createElement(ToastStackProvider, null, ...children))
  return seen
}

const undo = vi.fn(async () => {})
let done: string[] = []
const markDone = (id: string, name: string): Step => api => { done.push(showMarkedDone(api.toast, { id, name }, undo)) }

describe("the undoable Mark Done (#103)", () => {
  it("shows the Marked Done toast with Undo, and the palette's undo runs the toast's own action", () => {
    const toast = vi.fn<ToastStackApi["toast"]>(() => "toast-7")
    undo.mockClear()
    showMarkedDone(toast, { id: "r1", name: "LAN-12" }, undo)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: "success", title: "Marked Done", description: "LAN-12 is now Done.", duration: 10_000 }))
    const action = toast.mock.calls[0][0].action
    expect(action?.label).toBe("Undo")

    let pending: ReturnType<typeof useUndoableMarkDone> = null
    run(markDone("r1", "LAN-12"), () => { pending = useUndoableMarkDone() })
    undo.mockClear()
    pending!.undo()
    expect(undo).toHaveBeenCalledWith(done.at(-1), "r1", "LAN-12")
    // The toast's button: the same function with the same arguments.
    action!.onClick("toast-7")
    expect(undo).toHaveBeenLastCalledWith("toast-7", "r1", "LAN-12")
  })

  it("is the latest Mark Done while its toast still offers Undo", () => {
    done = []
    expect(run(markDone("r1", "LAN-1"), "read", markDone("r2", "LAN-2"), "read")).toEqual(["LAN-1", "LAN-2"])
  })

  it("is gone once its toast closes: dismissed, swiped or timed out", () => {
    done = []
    expect(run(markDone("r1", "LAN-1"), api => api.dismiss(done[0]), "read")).toEqual([null])
    expect(run(markDone("r1", "LAN-1"), api => api.dismiss(), "read")).toEqual([null])
  })

  it("is gone once the toast loses Undo: Undo pressed, or the Done failed", () => {
    done = []
    expect(run(markDone("r1", "LAN-1"), api => api.update(done[0], { type: "loading", title: "Undoing", action: undefined }), "read")).toEqual([null])
    expect(run(markDone("r1", "LAN-1"), api => api.toast({ id: done[1], type: "error", title: "Could not save", action: undefined }), "read")).toEqual([null])
  })

  it("never points at an older Mark Done once a newer one closes", () => {
    done = []
    expect(run(markDone("r1", "LAN-1"), markDone("r2", "LAN-2"), api => api.dismiss(done[1]), "read")).toEqual([null])
  })

  it("is null with no Mark Done in this stack", () => {
    expect(run("read")).toEqual([null])
  })
})
