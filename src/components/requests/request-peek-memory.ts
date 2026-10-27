import type { RequestAttachment, RequestComment, RequestDetail } from "./detail-view"

export type PeekDetail = { request: RequestDetail; comments: RequestComment[]; attachments: RequestAttachment[] }
/** `session`: a 401 or 403. The copy shown can no longer be trusted, so it is replaced, not kept. */
export type PeekEntry = { status: "ready"; detail: PeekDetail } | { status: "unavailable" } | { status: "error"; message: string; session?: boolean }

// Plan item 2.12: what the preview last read for each Request, for this page's life and this viewer
// and workspace only, so J back to a Request shows it at once while a fresh copy loads. #258: rows
// fill it ahead of opening (loadPeekAhead), so it lives with the list, not in the preview's own chunk.
const entries = new Map<string, PeekEntry>()
const writtenAt = new Map<string, number>()
const listeners = new Set<() => void>()
const MAX_ENTRIES = 30
/** How long a copy read ahead counts as fresh: a row rested on again within it is not read again. The
 * same 30 s the router keeps a prefetched Request page for (staleTimes in next.config.ts). */
const FRESH_MS = 30_000

export const peekKey = (orgId: string, viewerId: string, requestId: string) => `${orgId}:${viewerId}:${requestId}`
export const peekEntry = (key: string) => entries.get(key)
export function subscribePeek(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function write(key: string, entry: PeekEntry) {
  entries.delete(key)
  entries.set(key, entry)
  writtenAt.set(key, Date.now())
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value!
    entries.delete(oldest)
    writtenAt.delete(oldest)
  }
  for (const notify of listeners) notify()
}

/** Stores a read. A failed refresh keeps the copy already shown, unless the session itself changed. */
export function storePeek(key: string, next: PeekEntry) {
  if (next.status === "error" && !next.session && entries.get(key)?.status === "ready") return
  write(key, next)
}

/** A read that never reached the route (offline). Kept only when there is no copy to show instead. */
export function storePeekFailure(key: string, error: unknown) {
  if (entries.get(key)?.status !== "ready") write(key, { status: "error", message: error instanceof Error && error.name === "TypeError" ? "Check your connection and try again." : "This Request could not be loaded. Try again." })
}

type Wire = {
  request: Omit<RequestDetail, "createdAt"> & { createdAt: string }
  comments: (Omit<RequestComment, "createdAt"> & { createdAt: string })[]
  attachments: (Omit<RequestAttachment, "uploadedAt"> & { uploadedAt: string | null })[]
}

/** Reads one Request through the GET route (plan items 1.16 and 2.12), never a server action. */
export async function readPeek(orgId: string, id: string, signal?: AbortSignal): Promise<PeekEntry> {
  const response = await fetch(`/api/requests/${encodeURIComponent(id)}?${new URLSearchParams({ org: orgId })}`, { headers: { Accept: "application/json" }, signal })
  const body = await response.json().catch(() => null) as (Wire & { error?: string }) | null
  if (response.status === 404) return { status: "unavailable" }
  if (!response.ok || !body?.request) return { status: "error", message: body?.error ?? "This Request could not be loaded. Try again.", session: response.status === 401 || response.status === 403 }
  return { status: "ready", detail: {
    request: { ...body.request, createdAt: new Date(body.request.createdAt) },
    comments: body.comments.map(comment => ({ ...comment, createdAt: new Date(comment.createdAt) })),
    attachments: body.attachments.map(attachment => ({ ...attachment, uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : null })),
  } }
}

const reading = new Set<string>()

/**
 * #258: reads a Request into the memory before its preview opens, once while the copy is fresh. A
 * missing or hidden Request and a refused session are stored as an opened preview stores them, so
 * its "unavailable" and error states still show. Opening still reads a fresh copy behind this one;
 * if that lands first, this older read is dropped.
 */
export function loadPeekAhead(orgId: string, viewerId: string, requestId: string) {
  const key = peekKey(orgId, viewerId, requestId)
  if (reading.has(key) || (entries.has(key) && Date.now() - (writtenAt.get(key) ?? 0) < FRESH_MS)) return
  reading.add(key)
  const before = entries.get(key)
  readPeek(orgId, requestId).then(next => { if (entries.get(key) === before) storePeek(key, next) },
    // Offline: nothing is stored, and the preview reads (and says so) when it opens.
    () => undefined).finally(() => reading.delete(key))
}
