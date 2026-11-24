import type { WorkspacePermission } from "@/lib/auth-guard"
import { ONBOARDING_URL } from "@/lib/onboarding-address"

/** What a frame was drawn for. */
export type FrameSession = { orgId: string; role: WorkspacePermission }
/** Where the session no longer agrees with the frame: in another workspace or none, or here with this other role. */
type Mismatch = "workspace" | { role: string }

type Tab = {
  offline: () => boolean
  path: () => string
  /** Full loads, which keep nothing of this page: of `/`, and of the address the tab is on. */
  openHome: () => void
  reload: () => void
}

/**
 * #402 (#383 stories 59, 60 and 72): Next keeps the (app) layout across in-app moves, so after a removal, a role
 * change or a workspace switch in another tab, the page it moves to is the session's and the frame around it isn't.
 * After each move, Back and Forward included, the frame asks the server for the person's role in its own workspace
 * (the session read alone) and, on a difference, loads Lane in full: `/` in another workspace, where this address
 * means nothing, else the address it is on. It never holds up a move. An ended session, a failure or no connection
 * changes nothing. A full load draws a frame from the session that answers, so it never meets a mismatch of its own.
 */
export function createFrameCheck(tab: Tab) {
  /** The session the page's first frame was drawn for. Later frames in it are drawn from memory or a refresh. */
  let own: FrameSession | null = null
  let asking: { address: string; abort: () => void } | null = null
  /** The mismatch the page was left for; staying on it (a file still uploading) doesn't load it again. */
  let leftFor: string | null = null
  /** Whether a frame is on the page now. */
  let mounted = false

  function leave(mismatch: Mismatch) {
    const key = mismatch === "workspace" ? mismatch : mismatch.role
    if (key === leftFor) return
    leftFor = key
    if (mismatch === "workspace") tab.openHome()
    else tab.reload()
  }

  function drop() {
    asking?.abort()
    asking = null
  }

  async function ask(frame: FrameSession, address: string) {
    if (asking?.address === address) return
    drop()
    if (tab.offline()) return
    const controller = new AbortController()
    const mine = asking = { address, abort: () => controller.abort() }
    const mismatch = await readMismatch(frame, controller.signal).catch(() => null)
    if (asking !== mine) return
    asking = null
    if (mismatch) leave(mismatch)
  }

  return {
    /** The frame, drawn for `frame`, shows `address`. `moved`: an in-app move brought it, not a rewritten address. */
    shown(frame: FrameSession, address: string, moved: boolean) {
      const returned = !mounted
      mounted = true
      if (!own) { own = frame; return }
      if (frame.orgId !== own.orgId) leave("workspace")
      else if (frame.role !== own.role) leave({ role: frame.role })
      else if (moved || returned) void ask(own, address)
    },
    /** A newer move has started, whose own check will answer: a full load of this address would undo it. */
    moving: drop,
    /** The frame is gone from the page. On Onboarding, the person has no workspace left, and Back would show this one. */
    unmounted() {
      mounted = false
      drop()
      if (tab.path() !== ONBOARDING_URL) return
      leftFor = "workspace"
      tab.reload()
    },
    /** The browser brought the whole page back as it was left (its back/forward cache). */
    restored() {
      if (!own) return
      if (leftFor === null || tab.offline()) { void ask(own, tab.path()); return }
      tab.openHome()
    },
  }
}
export type FrameCheck = ReturnType<typeof createFrameCheck>

/** Lane's own answers only: a firewall's 403 or a network's sign-in page says nothing about the session. */
async function readMismatch(frame: FrameSession, signal: AbortSignal): Promise<Mismatch | null> {
  const response = await fetch(`/api/notifications/unread?${new URLSearchParams({ org: frame.orgId, only: "role" })}`, {
    signal, headers: { accept: "application/json" }, credentials: "same-origin",
  })
  const body: { role?: unknown; error?: unknown } = await response.json()
  if (response.status === 403) return typeof body.error === "string" ? "workspace" : null
  return response.ok && typeof body.role === "string" && body.role !== frame.role ? { role: body.role } : null
}
