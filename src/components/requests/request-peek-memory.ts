import type { RequestAttachment, RequestComment, RequestDetail } from "./detail-view"
import { PREFETCH_INTENT_MS } from "./use-intent-prefetch"
import { CHECK_CONNECTION, SESSION_CHANGED, SESSION_ENDED } from "@/lib/failure-messages"

type Detail = { request: RequestDetail; comments: RequestComment[]; attachments: RequestAttachment[] }
/** `session`: a 401 or 403. The copy shown can no longer be trusted, so it is replaced, not kept. */
type Entry = { status: "ready"; detail: Detail } | { status: "unavailable" } | { status: "error"; message: string; session?: boolean }

const COULD_NOT_LOAD = "This Request couldn't be loaded. Try again."

// Plan item 2.12: what the preview last read for each Request, for this page's life and this viewer
// and workspace only, so J back to a Request shows it at once while a fresh copy loads. #258: rows
// fill it ahead of opening (readAhead), so it lives with the list, not in the preview's own chunk.
const memory = new Map<string, { entry: Entry; writtenAt: number }>()
const listeners = new Set<() => void>()
const MAX_ENTRIES = 30
/** How long a copy read ahead counts as fresh: a row rested on again within it is not read again. The
 * same 30 s the router keeps a prefetched Request page for (staleTimes in next.config.ts). */
const FRESH_MS = 30_000

/** #258: the read in flight for each Request, so a read ahead and the preview never read one Request twice at once. */
const inFlight = new Map<string, { ahead: boolean; read: Promise<Entry> }>()

/** One Request as one viewer in one workspace sees it: the memory keeps a copy per target. */
export type PeekTarget = { orgId: string; viewerId: string; requestId: string }
export const peekKey = ({ orgId, viewerId, requestId }: PeekTarget) => `${orgId}:${viewerId}:${requestId}`
export const peekEntry = (key: string) => memory.get(key)?.entry
export function subscribePeek(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function write(key: string, entry: Entry) {
  memory.delete(key)
  memory.set(key, { entry, writtenAt: Date.now() })
  if (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value!)
  for (const notify of listeners) notify()
}

/** Stores a read. A failed refresh keeps the copy already shown, unless the session itself changed. */
function store(key: string, next: Entry) {
  if (next.status === "error" && !next.session && peekEntry(key)?.status === "ready") return
  write(key, next)
}

/** A read that never reached the route (offline). Kept only when there is no copy to show instead. */
function storeFailure(key: string, error: unknown) {
  if (peekEntry(key)?.status !== "ready") write(key, { status: "error", message: error instanceof Error && error.name === "TypeError" ? CHECK_CONNECTION : COULD_NOT_LOAD })
}

type Wire = {
  request: Omit<RequestDetail, "createdAt"> & { createdAt: string }
  comments: (Omit<RequestComment, "createdAt"> & { createdAt: string })[]
  attachments: (Omit<RequestAttachment, "uploadedAt"> & { uploadedAt: string | null })[]
}

/** Reads one Request through the GET route (plan items 1.16 and 2.12), never a server action. */
async function fetchDetail(orgId: string, id: string, signal?: AbortSignal): Promise<Entry> {
  const response = await fetch(`/api/requests/${encodeURIComponent(id)}?${new URLSearchParams({ org: orgId })}`, { headers: { Accept: "application/json" }, signal })
  const body = await response.json().catch(() => null) as (Wire & { error?: string }) | null
  if (response.status === 404) return { status: "unavailable" }
  // #260 (A18): Lane's own words, never the response's text.
  const session = response.status === 401 || response.status === 403
  if (!response.ok || !body?.request) return { status: "error", message: response.status === 401 ? SESSION_ENDED : response.status === 403 ? SESSION_CHANGED : COULD_NOT_LOAD, session }
  return { status: "ready", detail: {
    request: { ...body.request, createdAt: new Date(body.request.createdAt) },
    comments: body.comments.map(comment => ({ ...comment, createdAt: new Date(comment.createdAt) })),
    attachments: body.attachments.map(attachment => ({ ...attachment, uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : null })),
  } }
}

function startRead(key: string, ahead: boolean, read: Promise<Entry>) {
  const current = { ahead, read }
  inFlight.set(key, current)
  const done = () => { if (inFlight.get(key) === current) inFlight.delete(key) }
  read.then(done, done)
  return read
}

/**
 * #258: reads a Request into the memory before its preview opens, unless it is being read already or
 * its copy is fresh. A missing or hidden Request and a refused session are stored as an opened preview
 * stores them, so its "unavailable" and error states still show. If a fresher read lands first, this
 * older one is dropped.
 */
export function readAhead(target: PeekTarget) {
  const { orgId, requestId } = target
  const key = peekKey(target)
  const before = memory.get(key)
  if (inFlight.has(key) || (before && Date.now() - before.writtenAt < FRESH_MS)) return
  startRead(key, true, fetchDetail(orgId, requestId)).then(next => { if (memory.get(key) === before) store(key, next) },
    // Offline: nothing is stored; a preview that opened meanwhile says so (readForPreview).
    () => undefined)
}

/**
 * The preview's read, on open and after each change (`opening` false). Opening while a read ahead is in
 * flight waits on that read instead of starting another. Otherwise it reads a fresh copy: at once
 * behind a stored copy, or after the rest delay when there is none, so a held J reads only the
 * Request it stops on. `signal` aborts it (and a read not yet started) when the preview moves on or closes.
 */
export function readForPreview(target: PeekTarget, signal: AbortSignal, { opening }: { opening: boolean }) {
  const { orgId, requestId } = target
  const key = peekKey(target)
  const read = () => {
    const ahead = inFlight.get(key)
    if (opening && ahead?.ahead) {
      // The read ahead stores what it reads; only a read that never reached the route is the preview's to report.
      ahead.read.catch((error: unknown) => { if (!signal.aborted) storeFailure(key, error) })
      return
    }
    startRead(key, false, fetchDetail(orgId, requestId, signal)).then(next => {
      // An abort while the body was read is not a failure: a newer read is on its way.
      if (!signal.aborted) store(key, next)
    }, (error: unknown) => { if (!signal.aborted) storeFailure(key, error) })
  }
  // Still on a timer behind a copy or a read ahead, so an effect that runs and is undone at once reads nothing.
  const timer = setTimeout(read, memory.has(key) || (opening && inFlight.get(key)?.ahead) ? 0 : PREFETCH_INTENT_MS)
  signal.addEventListener("abort", () => clearTimeout(timer), { once: true })
}
