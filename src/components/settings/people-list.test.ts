import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { SETTINGS_SECTION_EVENT } from "./settings-catalog"
import { focusAskedPeopleList, followPeopleList, PEOPLE_LIST, PEOPLE_LIST_HREF, showPeopleList } from "./people-list"
import { WorkspaceMembersView } from "./workspace-members-view"

/** The parts of a browser page the People list's link touches: its address, its history and its elements. */
function openPage(address: string) {
  const page = new EventTarget() as EventTarget & Record<string, unknown>
  const location = { href: new URL(address, "https://app.example.test").href, get hash() { return new URL(this.href).hash }, get pathname() { return new URL(this.href).pathname }, get search() { return new URL(this.href).search } }
  const frames: (() => void)[] = []
  Object.assign(page, { location, history: { pushState: (_state: unknown, _title: string, url: URL) => { location.href = url.href } }, requestAnimationFrame: (run: () => void) => frames.push(run) })
  const people = { focus: vi.fn() }
  let loaded = false
  vi.stubGlobal("window", page)
  vi.stubGlobal("requestAnimationFrame", page.requestAnimationFrame)
  vi.stubGlobal("document", { getElementById: (id: string) => loaded && id === "people" ? people : null })
  return { page, location, people, load: () => { loaded = true }, nextFrame: () => { while (frames.length) frames.shift()!() } }
}

afterEach(() => vi.unstubAllGlobals())

const PAGES = ["/settings/profile?section=workspace", "/settings/members?section=workspace", "/settings/metrics?section=workspace", "/settings/metrics/3f0c2a4e-1111-4222-8333-944445555666?section=workspace"]

describe("Make someone an Admin's way to the People list (#395)", () => {
  it("is a group the People heading names, and code can focus, for an Admin and a Member, loaded or not", () => {
    for (const canManage of [true, false]) for (const state of ["ready", "loading", "error"] as const) {
      const html = renderToStaticMarkup(createElement(WorkspaceMembersView, { people: [], invitations: [], selfId: "user_a", canManage, state, onInvite: async () => ({}), onChangeRole: async () => ({}), onRevoke: async () => ({}), onRetry: () => {} }))
      expect(html).toMatch(new RegExp(`<section id="${PEOPLE_LIST}" tabindex="-1"[^>]*aria-labelledby="people-heading"`))
    }
  })

  it("opens on Settings' own address from anywhere else, such as a new tab", () => {
    expect(PEOPLE_LIST_HREF).toBe("/settings/profile?section=members#people")
  })

  it.each(PAGES)("shows Members in place on %s, and focuses a list already there once it's showing", address => {
    const { location, people, load, nextFrame } = openPage(address)
    load()
    const stop = followPeopleList()
    expect(people.focus).not.toHaveBeenCalled()

    showPeopleList()
    expect(new URL(location.href).pathname).toBe(new URL(address, "https://app.example.test").pathname)
    expect(new URLSearchParams(location.search).get("section")).toBe("members")
    // The frame un-hides Members on the same event, so the list takes focus after that.
    expect(people.focus).not.toHaveBeenCalled()
    nextFrame()
    expect(people.focus).toHaveBeenCalledOnce()
    stop()
  })

  it.each(PAGES)("focuses the list when it loads later on %s", address => {
    const { people, load, nextFrame } = openPage(address)
    showPeopleList()
    nextFrame()
    load()
    followPeopleList()
    expect(people.focus).toHaveBeenCalledOnce()
  })

  it("takes focus on a page opened at its address, and no other", () => {
    for (const [address, times] of [[PEOPLE_LIST_HREF, 1], ["/settings/members", 0], ["/settings/profile?section=members#role", 0]] as const) {
      const { people, load } = openPage(address)
      load()
      focusAskedPeopleList()
      expect([address, people.focus.mock.calls.length]).toEqual([address, times])
    }
  })

  it("leaves focus alone when Settings shows another section, and once the list has gone", () => {
    const { page, people, load, nextFrame } = openPage("/settings/profile?section=workspace")
    load()
    const stop = followPeopleList()
    page.dispatchEvent(new Event(SETTINGS_SECTION_EVENT))
    nextFrame()
    stop()
    showPeopleList()
    nextFrame()
    expect(people.focus).not.toHaveBeenCalled()
  })
})
