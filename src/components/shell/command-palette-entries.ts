import type { CurrentRequest } from "@/components/requests/current-request"
import { settingsNavigation } from "@/components/settings/settings-catalog"
import { SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"
import { REQUEST_PRIORITIES, REQUEST_PRIORITY_LABELS, type RequestPriority } from "@/lib/request-constants"
import { allowedMove, type LifecycleMove } from "@/lib/request-lifecycle"
import { REQUEST_STATUS_FILTERS, type RequestStatusFilter } from "@/lib/request-workspace"
import type { ShellSurface } from "./shell-openers"

/**
 * Spec #101 ("One entry list"): the ⌘K palette's entries, built from data only
 * so guest filtering and ordering stay unit-testable. Each entry carries an
 * action descriptor; the palette maps it to the same handler as its button.
 */
export type PaletteRole = "admin" | "member" | "guest"

/** What the entry list reads of the current Request (current-request.ts): the open one, else the list's highlighted row, with pending changes applied. */
export type PaletteRequest = Pick<CurrentRequest, "id" | "code" | "status" | "priority" | "canEdit"> & Partial<Pick<CurrentRequest, "agreementBlocked" | "pickupBlockedReason">>

export type PaletteUndo = { requestId: string }

export type PaletteInput = {
  role: PaletteRole
  request: PaletteRequest | null
  /** The latest Mark Done while its message's Undo is still available, else null. */
  undo: PaletteUndo | null
  projects: readonly { id: string; name: string }[]
}

export type PaletteGroup = "Request" | "Actions" | "Go to" | "Help"

export type PaletteAction =
  | { kind: "move"; move: LifecycleMove; requestId: string }
  | { kind: "undo-done"; requestId: string }
  | { kind: "priority"; requestId: string }
  | { kind: "set-priority"; requestId: string; priority: RequestPriority }
  | { kind: "copy"; copy: "link"; requestId: string }
  | { kind: "copy"; copy: "code"; requestId: string; code: string }
  /** A shell surface, opened through its shared opener (shell-openers.ts). */
  | { kind: "open"; surface: ShellSurface }
  | { kind: "view"; filter: RequestStatusFilter }
  | { kind: "project"; projectId: string }
  | { kind: "settings"; section: string; href: string }

export type PaletteEntry = {
  id: string
  label: string
  group: PaletteGroup
  /** What kind of place this is ("Project", "Settings"), shown beside the label and matched by the filter. */
  detail?: string
  /** Key hints, one per interchangeable alternative, as in the shortcut map. */
  keys: string[]
  action: PaletteAction
}

const VIEW_LABELS: Record<RequestStatusFilter, string> = { all: "All Requests", open: "Open", in_progress: "In Progress", done: "Done" }

/** The Anywhere keys from the one shortcut map, so the palette and the ? overlay never disagree. */
function anywhereKeys(label: string): string[] {
  return SHORTCUT_GROUPS.find(group => group.scope === "anywhere")?.shortcuts.find(shortcut => shortcut.label === label)?.keys ?? []
}

function requestEntries(request: PaletteRequest | null, undo: PaletteUndo | null, role: PaletteRole): PaletteEntry[] {
  const isGuest = role === "guest"
  const group = "Request"
  // The latest Mark Done may be another Request than the current one; it stays undoable either way.
  const undoEntry: PaletteEntry[] = undo && !isGuest ? [{ id: "undo-mark-done", label: "Undo Mark Done", group, keys: [], action: { kind: "undo-done", requestId: undo.requestId } }] : []
  if (!request) return undoEntry
  // The row menu and the detail strip offer the same move (plan item 2.4); the strip also stops a blocked pickup.
  const next = allowedMove(request, { isGuest })
  const move = next && !(next.move === "pick-up" && request.pickupBlockedReason) ? next : null
  const entries: PaletteEntry[] = []
  if (move) entries.push({ id: move.move === "done" ? "mark-done" : "pick-up", label: move.label, group, keys: [], action: { kind: "move", move: move.move, requestId: request.id } })
  entries.push(...undoEntry)
  // The row menu's rule: priority changes only on a Request the viewer may edit now (Open, and theirs or an admin's).
  if (!isGuest && request.canEdit) entries.push({ id: "change-priority", label: "Change priority…", group, keys: [], action: { kind: "priority", requestId: request.id } })
  entries.push({ id: "copy-link", label: "Copy link", group, keys: [], action: { kind: "copy", copy: "link", requestId: request.id } })
  if (request.code) entries.push({ id: "copy-code", label: "Copy code", group, keys: [], action: { kind: "copy", copy: "code", requestId: request.id, code: request.code } })
  return entries
}

export function paletteEntries({ role, request, undo, projects }: PaletteInput): PaletteEntry[] {
  const views = REQUEST_STATUS_FILTERS.map((filter): PaletteEntry => ({
    id: `view:${filter}`, label: filter === "all" && role === "guest" ? "My Requests" : VIEW_LABELS[filter], group: "Go to", detail: "Requests", keys: [], action: { kind: "view", filter },
  }))
  const places = [...projects, { id: "none", name: "No Project" }].map((project): PaletteEntry => ({
    id: `project:${project.id}`, label: project.name, group: "Go to", detail: "Project", keys: [], action: { kind: "project", projectId: project.id },
  }))
  const settings = settingsNavigation(role).map((entry): PaletteEntry => ({
    id: `settings:${entry.id}`, label: entry.label, group: "Go to", detail: "Settings", keys: [], action: { kind: "settings", section: entry.id, href: `/settings/profile?section=${entry.id}` },
  }))
  return [
    ...requestEntries(request, undo, role),
    { id: "new-request", label: "New Request", group: "Actions", keys: anywhereKeys("New Request"), action: { kind: "open", surface: "composer" } },
    { id: "search", label: "Search workspace", group: "Actions", keys: anywhereKeys("Search workspace"), action: { kind: "open", surface: "search" } },
    ...views, ...places, ...settings,
    { id: "notifications", label: "Notifications", group: "Go to", keys: [], action: { kind: "open", surface: "notifications" } },
    { id: "shortcuts", label: "Keyboard shortcuts", group: "Help", keys: anywhereKeys("Show or hide keyboard shortcuts"), action: { kind: "open", surface: "shortcuts" } },
  ]
}

export type PriorityEntry = PaletteEntry & { current: boolean }

/** The "Change priority…" step: every priority, the Request's current one marked (as the row menu checks it). */
export function priorityEntries(request: Pick<PaletteRequest, "id" | "priority">): PriorityEntry[] {
  return REQUEST_PRIORITIES.map(priority => ({
    id: `priority:${priority}`, label: REQUEST_PRIORITY_LABELS[priority], group: "Request", keys: [], current: priority === request.priority,
    action: { kind: "set-priority", requestId: request.id, priority },
  }))
}

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/**
 * Every typed word must start a word of the entry's label or detail, in any
 * order and case ("in prog" finds In Progress). No fuzzy matching, no ranking:
 * matches keep the list's own order. `empty` is the "No matches" state.
 */
export function filterPaletteEntries<T extends PaletteEntry>(entries: T[], query: string): { entries: T[]; empty: boolean } {
  const typed = words(query)
  if (!typed.length) return { entries, empty: false }
  const matches = entries.filter(entry => {
    const own = words(`${entry.label} ${entry.detail ?? ""}`)
    return typed.every(word => own.some(candidate => candidate.startsWith(word)))
  })
  return { entries: matches, empty: !matches.length }
}
