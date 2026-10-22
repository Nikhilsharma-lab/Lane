import { describe, expect, it } from "vitest"
import { filterPaletteEntries, paletteEntries, priorityEntries, type PaletteInput, type PaletteRequest } from "./command-palette-entries"

const projects = [{ id: "p1", name: "Checkout redesign" }, { id: "p2", name: "Billing" }]
const base: PaletteInput = { role: "member", request: null, undo: null, projects }
const ids = (input: PaletteInput) => paletteEntries(input).map(entry => entry.id)

describe("paletteEntries", () => {
  it("lists a member's entries in order with nothing typed", () => {
    expect(ids(base)).toEqual([
      "new-request", "search",
      "view:all", "view:open", "view:in_progress", "view:done",
      "project:p1", "project:p2", "project:none",
      "settings:profile", "settings:preferences", "settings:account-security", "settings:workspace", "settings:members", "settings:coming-soon",
      "notifications",
      "shortcuts",
    ])
  })

  it("gives a guest My Requests and only the Settings sections a guest can open", () => {
    const entries = paletteEntries({ ...base, role: "guest" })
    expect(entries.find(entry => entry.id === "view:all")?.label).toBe("My Requests")
    expect(entries.filter(entry => entry.detail === "Settings").map(entry => entry.label)).toEqual(["Profile", "Preferences", "Security & access", "Coming soon"])
  })

  it("gives an admin the same places as a member", () => {
    expect(ids({ ...base, role: "admin" })).toEqual(ids(base))
    expect(paletteEntries(base).find(entry => entry.id === "view:all")?.label).toBe("All Requests")
  })

  describe("current Request", () => {
    const request: PaletteRequest = { id: "r1", code: "LAN-12", status: "open", priority: "none", canEdit: true }
    const actions = (input: Partial<PaletteInput> & { request: PaletteRequest | null }) =>
      paletteEntries({ ...base, ...input }).filter(entry => entry.group === "Request").map(entry => entry.id)

    it("puts the Request's actions first", () => {
      expect(ids({ ...base, request }).slice(0, 5)).toEqual(["pick-up", "change-priority", "copy-link", "copy-code", "new-request"])
    })
    it("offers Pick up and priority on an Open Request", () => {
      expect(actions({ request })).toEqual(["pick-up", "change-priority", "copy-link", "copy-code"])
    })
    it("offers Mark Done on an In Progress Request, without priority", () => {
      expect(actions({ request: { ...request, status: "in_progress", canEdit: false } })).toEqual(["mark-done", "copy-link", "copy-code"])
    })
    it("offers only copying on a Done Request", () => {
      expect(actions({ request: { ...request, status: "done", canEdit: false } })).toEqual(["copy-link", "copy-code"])
    })
    it("hides the move on a Request whose reviews block it", () => {
      expect(actions({ request: { ...request, agreementBlocked: true } })).toEqual(["change-priority", "copy-link", "copy-code"])
    })
    it("hides Pick up while a pickup is blocked", () => {
      expect(actions({ request: { ...request, pickupBlockedReason: "Add the current values first." } })).toEqual(["change-priority", "copy-link", "copy-code"])
    })
    it("hides priority when the viewer can't edit the Request", () => {
      expect(actions({ request: { ...request, canEdit: false } })).toEqual(["pick-up", "copy-link", "copy-code"])
    })
    it("hides Copy code for a Request with no code", () => {
      expect(actions({ request: { ...request, code: null } })).toEqual(["pick-up", "change-priority", "copy-link"])
    })
    it("gives a guest no move, and priority only on an Open Request of their own", () => {
      expect(actions({ role: "guest", request })).toEqual(["change-priority", "copy-link", "copy-code"])
      for (const status of ["open", "in_progress", "done"] as const)
        expect(actions({ role: "guest", request: { ...request, status, canEdit: false } })).toEqual(["copy-link", "copy-code"])
    })
    it("describes each action as data", () => {
      const byId = Object.fromEntries(paletteEntries({ ...base, request }).map(entry => [entry.id, entry]))
      expect(byId["pick-up"]).toMatchObject({ label: "Pick up", action: { kind: "move", move: "pick-up", requestId: "r1" } })
      expect(byId["change-priority"]).toMatchObject({ label: "Change priority…", action: { kind: "priority", requestId: "r1" } })
      expect(byId["copy-link"]).toMatchObject({ label: "Copy link", action: { kind: "copy", copy: "link", requestId: "r1" } })
      expect(byId["copy-code"]).toMatchObject({ label: "Copy code", action: { kind: "copy", copy: "code", requestId: "r1", code: "LAN-12" } })
      const done = paletteEntries({ ...base, request: { ...request, status: "in_progress" } }).find(entry => entry.id === "mark-done")
      expect(done).toMatchObject({ label: "Mark Done", action: { kind: "move", move: "done", requestId: "r1" } })
    })
  })

  describe("Undo Mark Done", () => {
    const undo = { requestId: "r1" }
    const done: PaletteRequest = { id: "r1", code: "LAN-12", status: "done", priority: "none", canEdit: false }

    it("appears only while the Undo is available", () => {
      expect(ids({ ...base, request: done, undo }).slice(0, 3)).toEqual(["undo-mark-done", "copy-link", "copy-code"])
      expect(ids({ ...base, request: done })).not.toContain("undo-mark-done")
    })
    it("appears first with no current Request", () => {
      const [first] = paletteEntries({ ...base, undo })
      expect(first).toMatchObject({ id: "undo-mark-done", label: "Undo Mark Done", group: "Request", action: { kind: "undo-done", requestId: "r1" } })
    })
    it("is never offered to a guest", () => {
      expect(ids({ ...base, role: "guest", request: done, undo })).not.toContain("undo-mark-done")
    })
    it("comes after the move and before priority", () => {
      expect(ids({ ...base, request: { ...done, status: "open", canEdit: true }, undo: { requestId: "r2" } }).slice(0, 3)).toEqual(["pick-up", "undo-mark-done", "change-priority"])
    })
  })

  it("lists the priorities for the priority step, with the current one marked", () => {
    const entries = priorityEntries({ id: "r1", priority: "high" })
    expect(entries.map(entry => [entry.label, entry.current])).toEqual([
      ["No priority", false], ["Urgent", false], ["High", true], ["Medium", false], ["Low", false],
    ])
    expect(entries[1]).toMatchObject({ id: "priority:urgent", action: { kind: "set-priority", requestId: "r1", priority: "urgent" } })
  })

  describe("filterPaletteEntries", () => {
    const entries = paletteEntries(base)
    const matching = (query: string) => filterPaletteEntries(entries, query).entries.map(entry => entry.id)

    it("keeps every entry, in order, with nothing typed", () => {
      expect(filterPaletteEntries(entries, "  ")).toEqual({ entries, empty: false })
    })
    it("matches Project names by word start", () => {
      expect(matching("bill")).toEqual(["project:p2"])
      expect(matching("redes")).toEqual(["project:p1"])
    })
    it("does not match inside a word", () => {
      expect(matching("esign")).toEqual([])
    })
    it("needs every typed word, in any case, to start a word", () => {
      expect(matching("In PROG")).toEqual(["view:in_progress"])
      expect(matching("settings mem")).toEqual(["settings:members"])
    })
    it("matches what kind of place an entry is", () => {
      expect(matching("project")).toEqual(["project:p1", "project:p2", "project:none"])
    })
    it("reports the empty match", () => {
      expect(filterPaletteEntries(entries, "zebra")).toEqual({ entries: [], empty: true })
    })
  })

  it("shows the key of entries that already have one", () => {
    const keys = Object.fromEntries(paletteEntries(base).filter(entry => entry.keys.length).map(entry => [entry.id, entry.keys]))
    expect(keys).toEqual({ "new-request": ["C"], search: ["/"], shortcuts: ["?"] })
  })
})
