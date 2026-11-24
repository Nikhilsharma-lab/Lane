import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFrameCheck, type FrameCheck, type FrameSession } from "./frame-check"

// #402: the frame asks the server, after each in-app move, whose workspace and role it is. `browser` stands for the
// tab: its connection, its address, and the full loads it makes. The server's own answers are frame-answer.test.ts's.

const HARBOUR: FrameSession = { orgId: "org_harbour", role: "member" }
const LIGHTHOUSE: FrameSession = { orgId: "org_lighthouse", role: "admin" }

const says = (role: string) => Response.json({ role })
const CHANGED = () => Response.json({ error: "Your workspace session changed. Refresh the page to continue." }, { status: 403 })

let browser: { offline: boolean; path: string; loads: string[] }
/** Each request the frame sent: its address, whether it was aborted, and how to answer it. */
let sent: { url: string; aborted: () => boolean; answer: (response: Response) => void; fail: () => void }[]
let check: FrameCheck

/** A full page load: the frame's code starts afresh, and draws its first frame. */
function fullLoad(frame: FrameSession, address = "/") {
  check = createFrameCheck({
    offline: () => browser.offline,
    path: () => browser.path,
    openHome: () => { browser.loads.push("/") },
    reload: () => { browser.loads.push("reload") },
  })
  move(frame, address)
}
/** The frame shows this address. */
function move(frame: FrameSession, address: string, moved = true) {
  browser.path = address.split("?")[0]
  check.shown(frame, address, moved)
}
const settled = () => new Promise(resolve => setTimeout(resolve))

beforeEach(() => {
  browser = { offline: false, path: "/", loads: [] }
  sent = []
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => new Promise<Response>((answer, reject) => {
    init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
    sent.push({ url, aborted: () => init.signal!.aborted, answer, fail: () => reject(new TypeError("Failed to fetch")) })
  }))
  fullLoad(HARBOUR)
})

describe("what it asks", () => {
  it("nothing as the page loads, then once per move, about its own workspace, from the session alone", async () => {
    expect(sent).toEqual([])
    move(HARBOUR, "/impact")
    expect(sent.map(({ url }) => url)).toEqual(["/api/notifications/unread?org=org_harbour&only=role"])
  })

  it("nothing for an address the page only rewrote, such as a list filter typed", () => {
    move(HARBOUR, "/?title=pay", false)
    expect(sent).toEqual([])
  })

  it("once more for a move that answers the same page from another address", () => {
    fullLoad(HARBOUR, "/impact")
    move(HARBOUR, "/impact?period=2026-Q3")
    expect(sent).toHaveLength(1)
  })

  it("not again while the same move is in flight, and drops it for a newer one", () => {
    move(HARBOUR, "/impact")
    move(HARBOUR, "/impact")
    expect(sent).toHaveLength(1)
    move(HARBOUR, "/inbox")
    expect(sent).toHaveLength(2)
    expect(sent[0].aborted()).toBe(true)
    expect(sent[1].aborted()).toBe(false)
  })

  it("no further once a newer move starts, so its answer can't undo that move", async () => {
    move(HARBOUR, "/impact")
    check.moving()
    expect(sent[0].aborted()).toBe(true)
    await settled()
    expect(browser.loads).toEqual([])
    move(HARBOUR, "/inbox")
    expect(sent).toHaveLength(2)
  })

  it("nothing while offline, and drops what was in flight for the page before", () => {
    move(HARBOUR, "/impact")
    browser.offline = true
    move(HARBOUR, "/inbox")
    expect(sent).toHaveLength(1)
    expect(sent[0].aborted()).toBe(true)
  })

  it("as the frame comes back from Back, and not for a frame that leaves before it's answered", () => {
    move(HARBOUR, "/impact")
    check.unmounted()
    expect(sent[0].aborted()).toBe(true)
    move(HARBOUR, "/")
    expect(sent).toHaveLength(2)
  })
})

describe("what it does about the answer", () => {
  const answered = async (response: Response) => {
    sent.at(-1)!.answer(response)
    await settled()
  }

  it("nothing while the workspace and role are its own", async () => {
    move(HARBOUR, "/impact")
    await answered(says("member"))
    expect(browser.loads).toEqual([])
  })

  it("loads / in full once the session is in another workspace, or none", async () => {
    move(HARBOUR, "/impact")
    await answered(CHANGED())
    expect(browser.loads).toEqual(["/"])
  })

  it("loads the address it is on in full once only the role differs", async () => {
    move(HARBOUR, "/impact")
    await answered(says("viewer"))
    expect(browser.loads).toEqual(["reload"])
  })

  it("leaves an ended session to the page", async () => {
    move(HARBOUR, "/impact")
    await answered(Response.json({ error: "Sign in to continue." }, { status: 401 }))
    expect(browser.loads).toEqual([])
  })

  it.each([
    ["a 500", () => Response.json({ error: "Your Inbox couldn’t be loaded. Try again." }, { status: 500 })],
    ["a 503", () => new Response("busy", { status: 503 })],
    ["a 403 that isn't Lane's, such as a firewall's page", () => new Response("<html>Forbidden</html>", { status: 403 })],
    ["a 200 that isn't Lane's, such as a sign-in page of a network's", () => new Response("<html>Welcome to the Wi-Fi</html>")],
    ["a 200 with no role", () => Response.json({})],
  ])("does nothing about %s", async (_, response) => {
    move(HARBOUR, "/impact")
    await answered(response())
    expect(browser.loads).toEqual([])
    move(HARBOUR, "/inbox")
    expect(sent).toHaveLength(2)
  })

  it("does nothing about a lost connection, and asks again at the next move", async () => {
    move(HARBOUR, "/impact")
    sent[0].fail()
    await settled()
    expect(browser.loads).toEqual([])
    move(HARBOUR, "/inbox")
    expect(sent).toHaveLength(2)
  })

  it("does nothing about an answer to a move that was dropped", async () => {
    move(HARBOUR, "/impact")
    const dropped = sent[0]
    move(HARBOUR, "/inbox")
    dropped.answer(CHANGED())
    await answered(says("member"))
    expect(browser.loads).toEqual([])
  })

  it("loads in full only once for the same mismatch, should the person stay on the page", async () => {
    move(HARBOUR, "/impact")
    await answered(CHANGED())
    move(HARBOUR, "/inbox")
    await answered(CHANGED())
    expect(browser.loads).toEqual(["/"])
    // Another mismatch is another matter: they're back in the workspace, as a Viewer.
    move(HARBOUR, "/")
    await answered(says("viewer"))
    move(HARBOUR, "/impact")
    await answered(says("viewer"))
    expect(browser.loads).toEqual(["/", "reload"])
  })

  it("starts clean after the full load: the new frame is the workspace's and role's own", async () => {
    move(HARBOUR, "/impact")
    await answered(CHANGED())
    fullLoad(LIGHTHOUSE)
    move(LIGHTHOUSE, "/impact")
    await answered(says("admin"))
    expect(browser.loads).toEqual(["/"])
  })
})

describe("a frame drawn again in the same page", () => {
  it("loads in full, without asking, when a refresh brings another workspace or role", () => {
    check.shown(LIGHTHOUSE, "/", false)
    expect(browser.loads).toEqual(["/"])
    fullLoad(HARBOUR)
    check.shown({ ...HARBOUR, role: "viewer" }, "/", false)
    expect(browser.loads).toEqual(["/", "reload"])
    expect(sent).toEqual([])
  })

  it("loads Onboarding in full when the person is sent there, so Back can't bring the frame from memory", () => {
    browser.path = "/onboarding"
    check.unmounted()
    expect(browser.loads).toEqual(["reload"])
  })

  it("leaves any other way out of the frame alone", () => {
    browser.path = "/login"
    check.unmounted()
    expect(browser.loads).toEqual([])
  })
})

describe("a page the browser kept whole and brings back", () => {
  it("is asked about again", async () => {
    check.restored()
    expect(sent).toHaveLength(1)
    sent[0].answer(CHANGED())
    await settled()
    expect(browser.loads).toEqual(["/"])
  })

  it("loads in full at once when it was left for a mismatch", async () => {
    move(HARBOUR, "/impact")
    sent[0].answer(CHANGED())
    await settled()
    check.restored()
    expect(browser.loads).toEqual(["/", "/"])
    expect(sent).toHaveLength(1)
  })

  it("loads in full at once when it was left for Onboarding", () => {
    browser.path = "/onboarding"
    check.unmounted()
    check.restored()
    expect(browser.loads).toEqual(["reload", "/"])
  })

  it("stays as it is offline", () => {
    browser.offline = true
    check.restored()
    expect(sent).toEqual([])
    expect(browser.loads).toEqual([])
  })
})
