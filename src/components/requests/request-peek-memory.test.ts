import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// #258: the preview's memory, read through what the browser fetches. A read ahead (a row rested on) and
// the preview's open share one read per Request; opening on a stored copy still reads a fresh one behind it.

type Memory = typeof import("./request-peek-memory")
const ORG = "org_1"
const VIEWER = "user_1"
const ID = "11111111-1111-4111-8111-111111111111"

const body = (title: string) => JSON.stringify({
  request: { id: ID, title, createdAt: "2026-10-01T10:00:00.000Z" },
  comments: [],
  attachments: [],
})

let memory: Memory
let reads: { url: string; answer: (response: Response) => void; fail: (error: Error) => void }[]

beforeEach(async () => {
  vi.resetModules()
  memory = await import("./request-peek-memory")
  reads = []
  vi.stubGlobal("fetch", vi.fn((url: string) => new Promise<Response>((answer, fail) => { reads.push({ url, answer, fail }) })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const shown = () => memory.peekEntry(memory.peekKey(ORG, VIEWER, ID))
const title = () => { const entry = shown(); return entry?.status === "ready" ? entry.detail.request.title : null }
const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const open = (signal = new AbortController().signal) => memory.readForPreview(ORG, VIEWER, ID, signal, { opening: true })

describe("Request preview memory (#258)", () => {
  it("opening the preview while a read ahead is in flight waits on that read instead of reading again", async () => {
    memory.readAhead(ORG, VIEWER, ID)
    expect(reads).toHaveLength(1)
    open()
    await settle()
    expect(reads).toHaveLength(1)
    reads[0].answer(new Response(body("Read ahead"), { status: 200 }))
    await settle()
    expect(title()).toBe("Read ahead")
    expect(reads).toHaveLength(1)
  })

  it("opening on a stored copy shows it and reads a fresh copy behind it", async () => {
    memory.readAhead(ORG, VIEWER, ID)
    reads[0].answer(new Response(body("Read ahead"), { status: 200 }))
    await settle()
    open()
    await settle()
    expect(reads).toHaveLength(2)
    expect(title()).toBe("Read ahead")
    reads[1].answer(new Response(body("Fresh"), { status: 200 }))
    await settle()
    expect(title()).toBe("Fresh")
  })

  it("an open undone at once (React's development double effect) reads nothing", async () => {
    memory.readAhead(ORG, VIEWER, ID)
    reads[0].answer(new Response(body("Read ahead"), { status: 200 }))
    await settle()
    const undone = new AbortController()
    open(undone.signal)
    undone.abort()
    open()
    await settle()
    expect(reads).toHaveLength(2)
  })

  it("resting again reads nothing more while a read is in flight or the copy is fresh", async () => {
    memory.readAhead(ORG, VIEWER, ID)
    memory.readAhead(ORG, VIEWER, ID)
    expect(reads).toHaveLength(1)
    reads[0].answer(new Response(body("Read ahead"), { status: 200 }))
    await settle()
    memory.readAhead(ORG, VIEWER, ID)
    expect(reads).toHaveLength(1)
  })

  it("resting on a Request the open preview is reading reads nothing more", async () => {
    vi.useFakeTimers()
    open()
    await vi.advanceTimersByTimeAsync(100)
    expect(reads).toHaveLength(1)
    memory.readAhead(ORG, VIEWER, ID)
    expect(reads).toHaveLength(1)
  })

  it("a later change still reads a fresh copy while a read ahead is in flight", async () => {
    memory.readAhead(ORG, VIEWER, ID)
    memory.readForPreview(ORG, VIEWER, ID, new AbortController().signal, { opening: false })
    await settle()
    // No copy is shown yet, so the preview waits out the rest delay before its own read.
    await new Promise(resolve => setTimeout(resolve, 120))
    expect(reads).toHaveLength(2)
  })

  it("says the connection failed when the read ahead the preview waited on never reached the route", async () => {
    memory.readAhead(ORG, VIEWER, ID)
    open()
    await settle()
    reads[0].fail(new TypeError("Failed to fetch"))
    await settle()
    expect(shown()).toEqual({ status: "error", message: "Check your connection and try again." })
    expect(reads).toHaveLength(1)
  })

  it("a closed preview leaves no error behind for an offline read ahead", async () => {
    memory.readAhead(ORG, VIEWER, ID)
    const closed = new AbortController()
    open(closed.signal)
    await settle()
    closed.abort()
    reads[0].fail(new TypeError("Failed to fetch"))
    await settle()
    expect(shown()).toBeUndefined()
  })
})
