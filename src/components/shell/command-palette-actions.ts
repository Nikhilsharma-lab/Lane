import type { CurrentRequest } from "@/components/requests/current-request"
import type { MoveOptions, MoveTarget } from "@/components/requests/request-moves"
import type { RequestPriority } from "@/lib/request-constants"
import type { LifecycleMove } from "@/lib/request-lifecycle"
import type { RequestStatusFilter } from "@/lib/request-workspace"
import type { PaletteAction, PaletteEntry } from "./command-palette-entries"
import type { ShellSurface } from "./shell-openers"

/**
 * Issue #106 (spec #101): what each palette entry does. Request actions go
 * through useRequestMoves (its move asks "Pick up anyway?" itself) and its
 * copy (useCopy); the shell's surfaces through their shared openers. Every
 * call is made in the same tick as the Enter, so the hook's own same-frame
 * acknowledgement and its rollback on failure apply unchanged.
 */
export type PaletteActionDeps = {
  /** The current Request when the action runs; an action for another Request does nothing. */
  request: CurrentRequest | null
  viewer: { id: string; name: string }
  /** The latest Mark Done while its toast still offers Undo. */
  undo: { undo: () => void } | null
  moves: {
    move: (target: MoveTarget, kind: LifecycleMove, options?: MoveOptions) => Promise<unknown>
    setPriority: (requestId: string, priority: RequestPriority) => Promise<unknown>
    copy: (value: string, label: string) => Promise<boolean>
  }
  open: (surface: ShellSurface) => void
  view: (filter: RequestStatusFilter) => void
  project: (projectId: string) => void
  settings: (section: string, href: string) => void
  /** The canonical link the row menu copies. */
  link: (requestId: string) => string
}

const SURFACES = { "new-request": "composer", search: "search", notifications: "notifications", shortcuts: "shortcuts" } as const

/** Runs an entry. "Change priority…" is a step inside the palette, not an action, so it is the palette's. */
export function runPaletteAction(action: Exclude<PaletteAction, { kind: "priority" }>, deps: PaletteActionDeps): void {
  const request = "requestId" in action && deps.request?.id === action.requestId ? deps.request : null
  switch (action.kind) {
    case "move": {
      if (!request) return
      // Request detail's page and preview name the viewer as Assignee in the same frame; the row menu does not.
      const assignee = action.move === "pick-up" && request.source !== "list" ? deps.viewer : undefined
      void deps.moves.move({ id: request.id, name: request.name, reviewState: request.reviewState }, action.move, { assignee })
      return
    }
    case "undo-done": deps.undo?.undo(); return
    case "set-priority":
      if (request && request.priority !== action.priority) void deps.moves.setPriority(request.id, action.priority)
      return
    case "copy":
      void (action.copy === "link" ? deps.moves.copy(deps.link(action.requestId), "Link") : deps.moves.copy(action.code, "Code"))
      return
    case "view": deps.view(action.filter); return
    case "project": deps.project(action.projectId); return
    case "settings": deps.settings(action.section, action.href); return
    default: deps.open(SURFACES[action.kind])
  }
}

/** Search, the bell and the ? overlay are not mounted on Settings, so their entries are left out there. */
export function openableEntries<T extends PaletteEntry>(entries: T[], canOpen: (surface: ShellSurface) => boolean): T[] {
  return entries.filter(entry => !(entry.action.kind in SURFACES) || canOpen(SURFACES[entry.action.kind as keyof typeof SURFACES]))
}
