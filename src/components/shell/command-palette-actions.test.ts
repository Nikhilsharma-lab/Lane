import { describe, expect, it, vi } from "vitest"
import type { CurrentRequest } from "@/components/requests/current-request"
import { paletteEntries } from "./command-palette-entries"
import { openableEntries, runPaletteAction, type PaletteActionDeps } from "./command-palette-actions"

const current = (overrides: Partial<CurrentRequest> = {}): CurrentRequest => ({
  id: "r1", code: "LAN-12", name: "LAN-12", status: "open", priority: "none", source: "list", canEdit: true,
  agreementBlocked: false, reviewState: null, pickupBlockedReason: null, ...overrides,
})

type Moves = PaletteActionDeps["moves"]

function deps(overrides: Partial<Omit<PaletteActionDeps, "moves">> = {}, moves = {
  move: vi.fn<Moves["move"]>(async () => ({ status: "cancelled" as const })),
  setPriority: vi.fn<Moves["setPriority"]>(async () => ({ status: "skipped" as const })),
  copy: vi.fn<Moves["copy"]>(async () => true),
}) {
  const value = {
    request: current() as CurrentRequest | null, viewer: { id: "u1", name: "Test Member" }, undo: null as PaletteActionDeps["undo"], moves,
    open: vi.fn<PaletteActionDeps["open"]>(), view: vi.fn<PaletteActionDeps["view"]>(), project: vi.fn<PaletteActionDeps["project"]>(), settings: vi.fn<PaletteActionDeps["settings"]>(),
    link: (id: string) => `https://app.example.test/requests/${id}`,
    ...overrides,
  } satisfies PaletteActionDeps
  return value
}

describe("the palette's actions run the buttons' own handlers (#106)", () => {
  it("picks up through useRequestMoves' move, which asks 'Pick up anyway?' itself", () => {
    const reviewState = { concerns: [{ name: "Ana", reason: "Copy is unclear" }], unanswered: 1 }
    const d = deps({ request: current({ reviewState }) })
    runPaletteAction({ kind: "move", move: "pick-up", requestId: "r1" }, d)
    // No `confirmed`: the hook's confirmPickup runs first, as from the row menu.
    expect(d.moves.move).toHaveBeenCalledExactlyOnceWith({ id: "r1", name: "LAN-12", reviewState }, "pick-up", { assignee: undefined })
  })

  it("names the viewer as Assignee when picking up the open Request, as Request detail does", () => {
    const d = deps({ request: current({ source: "page" }) })
    runPaletteAction({ kind: "move", move: "pick-up", requestId: "r1" }, d)
    expect(d.moves.move.mock.calls[0][2]).toEqual({ assignee: { id: "u1", name: "Test Member" } })
    const peek = deps({ request: current({ source: "peek" }) })
    runPaletteAction({ kind: "move", move: "pick-up", requestId: "r1" }, peek)
    expect(peek.moves.move.mock.calls[0][2]).toEqual({ assignee: { id: "u1", name: "Test Member" } })
  })

  it("marks Done with no assignee", () => {
    const d = deps({ request: current({ status: "in_progress", source: "page" }) })
    runPaletteAction({ kind: "move", move: "done", requestId: "r1" }, d)
    expect(d.moves.move).toHaveBeenCalledExactlyOnceWith({ id: "r1", name: "LAN-12", reviewState: null }, "done", { assignee: undefined })
  })

  it("runs the Marked Done toast's own Undo", () => {
    const undo = vi.fn()
    runPaletteAction({ kind: "undo-done", requestId: "r9" }, deps({ undo: { undo } }))
    expect(undo).toHaveBeenCalledOnce()
  })

  it("sets a new priority and skips the current one, as the detail panel does", () => {
    const d = deps({ request: current({ priority: "low" }) })
    runPaletteAction({ kind: "set-priority", requestId: "r1", priority: "urgent" }, d)
    expect(d.moves.setPriority).toHaveBeenCalledExactlyOnceWith("r1", "urgent")
    runPaletteAction({ kind: "set-priority", requestId: "r1", priority: "low" }, d)
    expect(d.moves.setPriority).toHaveBeenCalledOnce()
  })

  it("copies the canonical link and the code with the row menu's messages", () => {
    const d = deps()
    runPaletteAction({ kind: "copy", copy: "link", requestId: "r1" }, d)
    runPaletteAction({ kind: "copy", copy: "code", requestId: "r1", code: "LAN-12" }, d)
    expect(d.moves.copy.mock.calls).toEqual([["https://app.example.test/requests/r1", "Link"], ["LAN-12", "Code"]])
  })

  it("does nothing to a Request that is no longer the current one", () => {
    const d = deps({ request: current({ id: "other" }) })
    runPaletteAction({ kind: "move", move: "pick-up", requestId: "r1" }, d)
    runPaletteAction({ kind: "set-priority", requestId: "r1", priority: "high" }, d)
    expect(d.moves.move).not.toHaveBeenCalled()
    expect(d.moves.setPriority).not.toHaveBeenCalled()
  })

  it.each([
    [{ kind: "new-request" }, "composer"], [{ kind: "search" }, "search"], [{ kind: "notifications" }, "notifications"], [{ kind: "shortcuts" }, "shortcuts"],
  ] as const)("opens %o through the shared opener", (action, surface) => {
    const d = deps()
    runPaletteAction(action, d)
    expect(d.open).toHaveBeenCalledExactlyOnceWith(surface)
  })

  it("goes to Requests views, Projects and Settings sections", () => {
    const d = deps()
    runPaletteAction({ kind: "view", filter: "done" }, d)
    runPaletteAction({ kind: "project", projectId: "none" }, d)
    runPaletteAction({ kind: "settings", section: "members", href: "/settings/profile?section=members" }, d)
    expect(d.view).toHaveBeenCalledWith("done")
    expect(d.project).toHaveBeenCalledWith("none")
    expect(d.settings).toHaveBeenCalledWith("members", "/settings/profile?section=members")
  })
})

// The acknowledgement of each mutation, through the real moves, is command-palette-acknowledgement.test.ts.

describe("what the palette offers where it is (#106)", () => {
  it("leaves out search, the bell and the ? overlay where they are not mounted (Settings), and keeps New Request", () => {
    const entries = paletteEntries({ role: "member", request: null, undo: null, projects: [] })
    const ids = openableEntries(entries, surface => surface === "composer").map(entry => entry.id)
    expect(ids).toContain("new-request")
    expect(ids).not.toContain("search")
    expect(ids).not.toContain("notifications")
    expect(ids).not.toContain("shortcuts")
    expect(openableEntries(entries, () => true)).toHaveLength(entries.length)
  })
})
