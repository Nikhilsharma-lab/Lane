import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { bindRequestNavigation, createRequestNavigation, useRequestNavigation } from "./request-navigation"
import { RequestListViewProvider, planListUrlSync, useListViewSnapshot, useSetRequestListView, type DetailSessionPatch, type ListViewState } from "./list-view-state"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
afterEach(() => vi.unstubAllGlobals())

function workspace(pathname = "/") {
  let view: ListViewState = {
    status: "open", project: "none", pagination: { pageIndex: 3, pageSize: 50 },
    columnVisibility: { submittedBy: true }, localFilters: [{ id: "title", value: "checkout" }, { id: "requestType", value: "bug" }],
    ordering: "oldest", grouping: "project", collapsedGroups: ["project:none"],
  }
  const original = view
  let session: DetailSessionPatch = { sequence: { ids: ["a", "b"], openedId: "a" } }
  const push = vi.fn(), replace = vi.fn()
  const controller = createRequestNavigation({ getView: () => view, setView: next => { view = typeof next === "function" ? next(view) : next }, setDetailSession: patch => { session = { ...session, ...patch } } })
  const browser = { location: () => ({ pathname, search: "" }), push, replace }
  return { original, view: () => view, session: () => session, controller, sidebar: bindRequestNavigation(controller, browser), palette: bindRequestNavigation(controller, browser), push, replace }
}

describe("workspace Requests navigation", () => {
  it("reselects the current Project from either caller by resetting only the page", () => {
    for (const source of ["sidebar", "palette"] as const) {
      const app = workspace()
      app[source].selectList({ project: "none" })
      expect(app.view()).toEqual({ ...app.original, pagination: { pageIndex: 0, pageSize: 50 } })
      expect(app.push).not.toHaveBeenCalled()
      expect(app.replace).not.toHaveBeenCalled()
    }
  })

  it("shares cancellation across caller bindings and consumes only the latest Request's arrival", () => {
    const app = workspace()
    const searchStillCurrent = app.sidebar.continuation()
    app.sidebar.open("/requests/a")
    app.palette.open("/requests/b")
    const focus = vi.fn()
    expect(searchStillCurrent()).toBe(false)
    expect(app.sidebar.arrive("a", focus)).toBe(false)
    expect(focus).not.toHaveBeenCalled()
    expect(app.palette.arrive("b", focus)).toBe(true)
    expect(focus).toHaveBeenCalledExactlyOnceWith(null)
    expect(app.sidebar.arrive("b", focus)).toBe(false)
    expect(app.view()).toBe(app.original)
    expect(app.session()).toEqual({ sequence: null, focusTitleOnArrival: false, focusOnArrival: null })
  })

  it("leaves in-place URL writing to the existing pending-mutation mirror", () => {
    const app = workspace()
    app.palette.selectList({ status: "done" })
    const input = { search: "", seen: "", written: null, current: app.view(), pathname: "/", locationSearch: "" }
    expect(planListUrlSync({ ...input, hold: true })).toEqual({ seen: "" })
    expect(planListUrlSync({ ...input, hold: false })).toEqual({ seen: "", write: "/?status=done&project=none" })
    expect(app.push).not.toHaveBeenCalled()
    expect(app.replace).not.toHaveBeenCalled()
  })

  it("pushes off-list selection once with the retained context", () => {
    const app = workspace("/requests/a")
    app.palette.selectList({ project: "all" })
    expect(app.push).toHaveBeenCalledExactlyOnceWith("/?status=open")
    expect(app.replace).not.toHaveBeenCalled()
  })

  it("supersedes a pending detail route while the browser still shows the list", () => {
    const app = workspace()
    app.sidebar.open("/requests/a")
    app.palette.selectList({ project: "all" })
    // Cancel the outstanding transition without adding a history entry or writing the new context early.
    expect(app.replace).toHaveBeenCalledExactlyOnceWith("/")
    expect(app.view().project).toBe("all")
    expect(app.sidebar.arrive("a", vi.fn())).toBe(false)
  })

  it("binds separate real consumers to the provider's one event-time view and generation", () => {
    const callers: ReturnType<typeof useRequestNavigation>[] = []
    let read: ReturnType<typeof useListViewSnapshot> = null
    let set: ReturnType<typeof useSetRequestListView> | undefined
    function Caller() {
      callers.push(useRequestNavigation())
      read = useListViewSnapshot(); set = useSetRequestListView()
      return null
    }
    renderToStaticMarkup(createElement(RequestListViewProvider, null, createElement(Caller), createElement(Caller)))
    vi.stubGlobal("window", { location: { pathname: "/", search: "" } })
    set!(current => ({ ...current, pagination: { pageIndex: 4, pageSize: 10 } }))
    const staleSearch = callers[0].continuation()
    callers[1].selectList({ project: "none" })
    callers[0].selectList({ status: "done" })
    expect(read!()).toMatchObject({ project: "none", status: "done", pagination: { pageIndex: 0, pageSize: 10 } })
    expect(staleSearch()).toBe(false)
  })

  it.each([
    { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 },
    { defaultPrevented: true }, { currentTarget: { target: "_blank" } }, { currentTarget: { target: "named-window" } },
    { currentTarget: { hasAttribute: () => true } },
  ])("leaves native or prevented activation untouched: %j", override => {
    const app = workspace()
    const current = app.sidebar.continuation()
    const event = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, currentTarget: {}, preventDefault: vi.fn(), ...override }
    expect(app.sidebar.followLink(event, "/requests/a")).toBe(false)
    expect(app.view()).toBe(app.original)
    expect(current()).toBe(true)
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(app.push).not.toHaveBeenCalled()
    expect(app.replace).not.toHaveBeenCalled()
  })

  it("gives an ordinary real link one routing owner and search arrival", () => {
    const app = workspace()
    const event = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, currentTarget: { target: "_self" }, preventDefault: vi.fn() }
    expect(app.sidebar.followLink(event, "/requests/a")).toBe(true)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(app.push).toHaveBeenCalledExactlyOnceWith("/requests/a")
    expect(app.session()).toMatchObject({ sequence: null, focusTitleOnArrival: true })
  })

  it("keeps J/K replacement history and settles the intended sequence on arrival", () => {
    const app = workspace("/requests/a")
    app.sidebar.replaceDetail("b", { sequence: { ids: ["a", "b"], openedId: "b", leavingId: "a" }, button: "next" })
    expect(app.replace).toHaveBeenCalledExactlyOnceWith("/requests/b", { scroll: false })
    expect(app.push).not.toHaveBeenCalled()
    const focus = vi.fn()
    app.sidebar.arrive("b", focus)
    expect(focus).toHaveBeenCalledExactlyOnceWith("next")
    expect(app.session().sequence).toEqual({ ids: ["a", "b"], openedId: "b" })
  })

  it("does not reload a Request already displayed", () => {
    const app = workspace("/requests/a")
    expect(app.sidebar.open("/requests/a")).toBe(false)
    expect(app.push).not.toHaveBeenCalled()
    expect(app.sidebar.arrive("a", vi.fn())).toBe(false)
  })

  it("cancels search-close focus on newer navigation and on its surface cleanup", () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => frames.push(fn))
    vi.stubGlobal("cancelAnimationFrame", vi.fn())
    const app = workspace(), focus = vi.fn()
    app.sidebar.deferFocus(focus)
    app.palette.open("/requests/a")
    frames[0](0)
    const cancel = app.sidebar.deferFocus(focus)
    cancel(); frames[1](0)
    expect(focus).not.toHaveBeenCalled()
    app.sidebar.deferFocus(focus); frames[2](0)
    expect(focus).toHaveBeenCalledOnce()
  })

  it("invalidates pending work on history, cleanup/setup and an A to B to A return", () => {
    const events = new EventTarget()
    const app = workspace()
    const unmount = app.controller.listenForHistory(events)
    const beforeHistory = app.sidebar.continuation()
    app.sidebar.open("/requests/a")
    events.dispatchEvent(new Event("popstate"))
    expect(beforeHistory()).toBe(false)
    expect(app.sidebar.arrive("a", vi.fn())).toBe(false)
    const beforeCleanup = app.sidebar.continuation()
    unmount()
    const cleanup = app.controller.listenForHistory(events)
    app.palette.open("/requests/b"); app.sidebar.open("/requests/a")
    expect(beforeCleanup()).toBe(false)
    const beforeUnmount = app.sidebar.continuation()
    cleanup()
    expect(beforeUnmount()).toBe(false)
    expect(app.sidebar.arrive("a", vi.fn())).toBe(false)
  })
})
