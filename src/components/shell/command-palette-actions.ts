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
  /** A page of its own, such as the Inbox. */
  go: (href: string) => void
  /** The canonical link the row menu copies. */
  link: (requestId: string) => string
  /** #268 (A14): the visible "Link copied" / "Code copied" message, beside the copy's own announcement. */
  copied: (message: string) => void
}

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
    case "copy": {
      const label = action.copy === "link" ? "Link" : "Code"
      void (action.copy === "link" ? deps.moves.copy(deps.link(action.requestId), label) : deps.moves.copy(action.code, label))
        .then(done => { if (done) deps.copied(`${label} copied`) })
      return
    }
    case "view": deps.view(action.filter); return
    case "project": deps.project(action.projectId); return
    case "settings": deps.settings(action.section, action.href); return
    case "go": deps.go(action.href); return
    case "open": deps.open(action.surface); return
  }
}

/** Search and the ? overlay are not mounted on Settings, so their entries are left out there. */
/**
 * Fix round 3 (#256): an entry that opens another popup (New Request, Search, the ? list) hands over to it. The palette
 * then leaves at once instead of fading out over it: a fading palette is still the top layer, and took that popup's
 * first Escape.
 */
export const handsOffToPopup = (action: PaletteAction) => action.kind === "open"

export function openableEntries<T extends PaletteEntry>(entries: T[], canOpen: (surface: ShellSurface) => boolean): T[] {
  return entries.filter(entry => entry.action.kind !== "open" || canOpen(entry.action.surface))
}
