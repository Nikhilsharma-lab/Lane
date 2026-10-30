"use client"

import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { OverviewRequest } from "@/lib/request-overview"
import { availableMove, type LifecycleMove } from "@/lib/request-lifecycle"
import { moveTarget, useRequestMoves } from "./request-moves"
import { useRequestNavigation } from "./request-navigation"
import { useServerRefresh } from "./use-optimistic-action"
import { useListAnnouncer } from "./list-announcer"
import { requestCount } from "./request-row-label"
import { isShown, restoreRequestFocus } from "./list-focus"

type SelectionState = {
  scope: string; ids: string[]; error: string; failedCount: number; message: string
  /** Every failure was a Request not ready to pick up: nothing to retry until its plan is complete. */
  notReadyOnly?: boolean
  pending: { kind: "pick-up" | "done" | "copy"; count: number } | null
}
const emptySelection = (scope: string): SelectionState => ({ scope, ids: [], error: "", failedCount: 0, message: "", pending: null })

/** Focus is still somewhere the person can see and use: a shown, enabled element, not the page itself. */
function focusKept() {
  const active = document.activeElement
  return active instanceof HTMLElement && active !== document.body && active.isConnected && isShown(active) && !active.matches(":disabled")
}

/** `readOnly` is a Viewer (#210): rows can be selected and copied, but the bar offers no move. */
export function useRequestSelection(scope: string, rows: OverviewRequest[], context?: { orgId: string }, isGuest = false, readOnly = false) {
  const refresh = useServerRefresh()
  // Plan item 2.4: selection changes speak in the list's one region; the bar shows "n selected".
  const announce = useListAnnouncer()
  const moves = useRequestMoves({ orgId: context?.orgId ?? "", announce })
  const { continuation } = useRequestNavigation()
  const [state, setState] = useState(() => emptySelection(scope))
  // Changing a filter/page/workspace starts a fresh selection, including when returning to an old view.
  if (state.scope !== scope) setState(emptySelection(scope))
  const current = state.scope === scope ? state : emptySelection(scope)
  const selected = rows.filter(row => current.ids.includes(row.id))
  const busy = current.pending !== null
  const activeScope = useRef<string | null>(scope)
  const running = useRef<symbol | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const restoreAfterCommit = useRef<(() => boolean) | null>(null)
  // Memoised rows keep the checkbox handler from the render that last changed
  // them, so toggle reads the latest selection here instead of from its closure.
  const latest = useRef({ selected, busy })
  useLayoutEffect(() => { latest.current = { selected, busy } })
  // A view change (filter, page, group collapse) starts a fresh selection. A
  // selection it drops is announced, so a J past the page edge or a collapse
  // from the keyboard never clears it silently (plan item 2.4).
  const held = useRef({ scope, count: 0 })
  const dropNoted = useRef(false)
  useLayoutEffect(() => {
    const previous = held.current
    held.current = { scope, count: selected.length }
    if (previous.scope !== scope && previous.count > 0 && !dropNoted.current) announce("Selection cleared.", { key: "selection" })
    dropNoted.current = false
  })
  /** For a view change the list announces itself (a page crossing): the dropped selection joins that message, said once. */
  function withDropNotice(text: string) {
    if (!held.current.count) return text
    dropNoted.current = true
    return `${text} Selection cleared.`
  }
  useLayoutEffect(() => {
    activeScope.current = scope
    running.current = null
    return () => { activeScope.current = null; running.current = null; restoreAfterCommit.current = null }
  }, [scope])
  useLayoutEffect(() => {
    if (busy || !restoreAfterCommit.current) return
    const current = restoreAfterCommit.current
    restoreAfterCommit.current = null
    if (!current()) return
    // Restore only focus that was lost (the bar it was on has gone). Focus on a row the
    // person moved to, or anywhere else they put it, stays (Esc after X and J).
    if (focusKept()) return
    const original = returnFocus.current
    // The control the selection started from (a row or its checkbox), else the grid's tab stop, else the title filter (plan item 2.4).
    if (original?.isConnected && isShown(original) && !original.matches(":disabled")) {
      original.focus({ preventScroll: true })
      original.scrollIntoView({ block: "nearest" })
    } else restoreRequestFocus("", { force: true })
  }, [busy, current.ids, scope])

  function clear() {
    if (busy) return
    restoreAfterCommit.current = continuation()
    setState({ ...emptySelection(scope), message: "Selection cleared" })
    announce("Selection cleared.", { key: "selection" })
  }
  const escape = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (event.key !== "Escape" || event.defaultPrevented || (!selected.length && !current.error && !current.failedCount) || busy || target?.closest('input,textarea,select,[role="dialog"],[role="menu"],[contenteditable="true"]')) return
    event.preventDefault()
    clear()
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => escape(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  function toggle(id: string, checked: boolean) {
    const { selected, busy } = latest.current
    if (busy) return
    if (!selected.length && checked && document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement
    setState(previous => ({ ...previous, error: "", failedCount: 0, message: "", ids: checked ? [...new Set([...selected.map(row => row.id), id])] : previous.ids.filter(value => value !== id) }))
    const count = checked ? new Set([...selected.map(row => row.id), id]).size : selected.filter(row => row.id !== id).length
    announce(count ? `${requestCount(count)} selected.` : "Selection cleared.", { key: "selection" })
  }
  function selectPage() {
    if (busy) return
    setState(previous => ({ ...previous, ids: rows.map(row => row.id), error: "", failedCount: 0, message: "" }))
    announce(`${requestCount(rows.length)} selected.`, { key: "selection" })
  }

  // The bulk bar offers a move only when every selected row allows the same one (plan item 2.4).
  const offered = context ? selected.map(row => availableMove(row, { isGuest, readOnly })?.move ?? null) : []
  const availableAction: LifecycleMove | null = offered.length && offered.every(move => move !== null && move === offered[0]) ? offered[0] : null
  const action = current.pending && current.pending.kind !== "copy" ? current.pending.kind : availableAction

  // Moves owns lifecycle coordination; selection owns only its current bar, IDs and focus.
  async function update() {
    if (!availableAction || !context || running.current) return
    const operation = Symbol()
    running.current = operation
    const navigationCurrent = continuation()
    const current = () => activeScope.current === scope && running.current === operation
    try {
      const outcome = await moves.moveMany(selected.map(row => ({
        ...moveTarget(row), status: row.status, agreementBlocked: row.agreementBlocked,
        pickupBlockedReason: row.pickupBlockedReason, requester: row.canEdit ? null : row.creatorName || "the Requester",
      })), availableAction, { isGuest, readOnly, current,
        onStart: count => {
          setState(previous => ({ ...previous, pending: { kind: availableAction, count }, error: "", failedCount: 0, message: "" }))
          announce(`Working on ${count} selected ${count === 1 ? "Request" : "Requests"}.`, { key: "selection" })
        },
      })
      if (!current() || outcome.status === "cancelled" || outcome.status === "busy") return
      // A same-scope navigation (such as opening Search) still releases pending UI,
      // but never restores old selection focus or publishes the old result there.
      if (outcome.detached || !navigationCurrent()) { setState(previous => ({ ...previous, pending: null })); return }
      restoreAfterCommit.current = navigationCurrent
      const failed = outcome.failed.map(item => item.id)
      const succeeded = outcome.status === "success" ? outcome.moved : []
      const pickedUp = availableAction === "pick-up" && succeeded.length ? `${requestCount(succeeded.length)} picked up.` : ""
      setState({ scope, ids: failed, pending: null, failedCount: failed.length, notReadyOnly: outcome.notReadyOnly,
        error: [...new Set(outcome.failed.map(item => item.error).filter(Boolean))].join(" "), message: pickedUp,
      })
      if (pickedUp && !failed.length) announce(pickedUp, { key: "selection" })
    } finally { if (current()) running.current = null }
  }

  async function copyLinks() {
    if (busy || !selected.length || running.current) return
    const operation = Symbol()
    running.current = operation
    setState(previous => ({ ...previous, pending: { kind: "copy", count: selected.length }, error: "", failedCount: 0, message: "" }))
    try {
      await navigator.clipboard.writeText(selected.map(row => new URL(`/requests/${row.id}`, window.location.origin).href).join("\n"))
      if (activeScope.current === scope && running.current === operation) {
        setState(previous => ({ ...previous, pending: null, message: "Links copied" }))
        announce("Links copied.", { key: "selection" })
      }
    } catch {
      if (activeScope.current === scope && running.current === operation) setState(previous => ({ ...previous, pending: null, error: "Links couldn't be copied. Try again." }))
    } finally { if (running.current === operation) running.current = null }
  }

  const failure = current.failedCount
  const error = failure && current.notReadyOnly
    ? `${current.message ? `${current.message} ` : ""}${failure} ${failure === 1 ? "Request wasn’t picked up." : "Requests weren’t picked up."} ${current.error}`
    : failure ? `${failure} ${failure === 1 ? "Request couldn't be updated." : "Requests couldn't be updated."} ${selected.length === failure ? `${failure === 1 ? "It is" : "They are"} still selected. Try again.` : "Some Requests have left this view. Refresh to see their current state."}${current.error ? ` ${current.error}` : ""}` : current.error
  // The bulk bar is memoised, so a J or a pointer focus on a row does not re-render it (plan item 2.4).
  // It calls these stable wrappers, which run the latest commit's actions.
  const run = useRef({ selectPage, clear, update, copyLinks })
  useLayoutEffect(() => { run.current = { selectPage, clear, update, copyLinks } })
  const actions = useMemo(() => ({
    selectPage: () => run.current.selectPage(),
    clear: () => run.current.clear(),
    update: () => run.current.update(),
    copyLinks: () => run.current.copyLinks(),
    refresh,
  }), [refresh])
  return { selected, busy, count: current.pending?.count ?? selected.length, error, message: current.message, action, toggle, withDropNotice, actions, allSelected: selected.length === rows.length }
}

export type RequestSelectionActions = ReturnType<typeof useRequestSelection>["actions"]
