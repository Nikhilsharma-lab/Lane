import { describe, expect, it } from "vitest"
import type { SavedView } from "@/lib/saved-view-nav"
import { renamedView, shownViews, withView } from "./saved-views-store"

const view = (id: string, name: string): SavedView => ({ id, name, filters: { status: "all", project: "all" } })
const names = (views: SavedView[]) => views.map(item => item.name)

describe("saved views as this tab shows them (#276)", () => {
  const server = [view("1", "Alpha"), view("2", "billing"), view("3", "Zeta")]

  it("puts a view saved here in its place by name at once, as the server orders them, whatever the case", () => {
    expect(names(shownViews(server, [withView(view("pending-view-1", "Checkout"))]))).toEqual(["Alpha", "billing", "Checkout", "Zeta"])
    expect(names(shownViews(server, [withView(view("pending-view-1", "aardvark"))]))).toEqual(["aardvark", "Alpha", "billing", "Zeta"])
  })
  it("moves a renamed view to its new place at once", () => {
    expect(names(shownViews(server, [renamedView("1", "Delivery")]))).toEqual(["billing", "Delivery", "Zeta"])
  })
  it("replaces a view of the same name, whatever its case", () => {
    expect(shownViews(server, [withView(view("4", "ZETA"))]).map(item => item.id)).toEqual(["1", "2", "4"])
  })
  it("shows the server's views as they came when nothing is pending", () => {
    expect(shownViews(server, [])).toBe(server)
  })
})
