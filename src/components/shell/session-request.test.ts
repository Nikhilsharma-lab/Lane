import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeAuthFetch, type AuthFetchFake } from "@/test/auth-fetch-fake"

// #389 (#383 "Keeping sessions alive"): the app frame asks Better Auth for the session once per full page load, after
// the page is usable. `page` stands for the browser's page: its `load` event, and when it is idle.

let auth: AuthFetchFake
let page: EventTarget & { document: { readyState: string } }

/** A full page load: the frame's code starts afresh. */
async function fullLoad() {
  vi.resetModules()
  const { requestSessionOnceUsable } = await import("./session-request")
  return requestSessionOnceUsable
}
/** Everything already under way finishes: the lazy import, then its request. */
const settled = () => new Promise(resolve => setTimeout(resolve, 50))

beforeEach(() => {
  auth = fakeAuthFetch()
  page = Object.assign(new EventTarget(), { document: { readyState: "loading" } })
  vi.stubGlobal("document", page.document)
  vi.stubGlobal("window", { requestIdleCallback: (run: () => void) => setTimeout(run) })
  vi.stubGlobal("addEventListener", page.addEventListener.bind(page))
  vi.stubGlobal("removeEventListener", page.removeEventListener.bind(page))
})
afterEach(() => { vi.unstubAllGlobals() })

const requests = () => auth.requests.map(({ method, path }) => `${method} ${path}`)

describe("the app frame's session request", () => {
  it("is one request, only once the page has loaded", async () => {
    const frameMounts = await fullLoad()
    frameMounts()
    await settled()
    expect(requests()).toEqual([])
    page.dispatchEvent(new Event("load"))
    await vi.waitFor(() => expect(requests()).toEqual(["GET /get-session"]))
  })

  it("isn't sent again when the frame mounts again in the same load, and is by the next full load", async () => {
    page.document.readyState = "complete"
    const frameMounts = await fullLoad()
    frameMounts()
    await vi.waitFor(() => expect(requests()).toHaveLength(1))
    frameMounts()
    await settled()
    expect(requests()).toHaveLength(1)

    const nextLoad = await fullLoad()
    nextLoad()
    await vi.waitFor(() => expect(requests()).toEqual(["GET /get-session", "GET /get-session"]))
  })

  it("is dropped with a frame that leaves before the page has loaded", async () => {
    const frameMounts = await fullLoad()
    frameMounts()()
    page.dispatchEvent(new Event("load"))
    await settled()
    expect(requests()).toEqual([])
  })

  it("says nothing when it fails", async () => {
    page.document.readyState = "complete"
    auth.throwOn("/get-session")
    const frameMounts = await fullLoad()
    frameMounts()
    await vi.waitFor(() => expect(requests()).toEqual(["GET /get-session"]))
    await settled()
  })
})
