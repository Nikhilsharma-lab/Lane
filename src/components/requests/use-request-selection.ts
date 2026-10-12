"use client"

import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { markDoneMany, pickUpRequests, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import type { OverviewRequest } from "@/lib/request-overview"
import { allowedMove, type LifecycleMove } from "@/lib/request-lifecycle"
import { useOptimisticAction, useOptimisticBatch, useServerRefresh } from "./use-optimistic-action"
import { useListAnnouncer } from "./list-announcer"
import { requestCount } from "./request-row-label"
import { isShown, restoreRequestFocus } from "./list-focus"

type SelectionState = {
  scope: string; ids: string[]; error: string; failedCount: number; message: string
  pending: { kind: "pick-up" | "done" | "copy"; count: number } | null
}
const emptySelection = (scope: string): SelectionState => ({ scope, ids: [], error: "", failedCount: 0, message: "", pending: null })

/** Focus is still somewhere the person can see and use: a shown, enabled element, not the page itself. */
function focusKept() {
  const active = document.activeElement
  return active instanceof HTMLElement && active !== document.body && active.isConnected && isShown(active) && !active.matches(":disabled")
}

export function useRequestSelection(scope: string, rows: OverviewRequest[], context?: { orgId: string }, isGuest = false) {
  const refresh = useServerRefresh()
  const optimistic = useOptimisticAction()
  const optimisticBatch = useOptimisticBatch()
  const { toast, update: updateToast } = useToastStack()
  // Plan item 2.4: selection changes speak in the list's one region; the bar shows "n selected".
  const announce = useListAnnouncer()
  const [state, setState] = useState(() => emptySelection(scope))
  // Changing a filter/page/workspace starts a fresh selection, including when returning to an old view.
  if (state.scope !== scope) setState(emptySelection(scope))
  const current = state.scope === scope ? state : emptySelection(scope)
  const selected = rows.filter(row => current.ids.includes(row.id))
  const busy = current.pending !== null
  const activeScope = useRef<string | null>(scope)
  const running = useRef<symbol | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const restoreAfterCommit = useRef(false)
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
    return () => { activeScope.current = null; running.current = null; restoreAfterCommit.current = false }
  }, [scope])
  useLayoutEffect(() => {
    if (busy || !restoreAfterCommit.current) return
    restoreAfterCommit.current = false
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
    restoreAfterCommit.current = true
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
  const moves = context ? selected.map(row => allowedMove(row, { isGuest })?.move ?? null) : []
  const availableAction: LifecycleMove | null = moves.length && moves.every(move => move !== null && move === moves[0]) ? moves[0] : null
  const action = current.pending && current.pending.kind !== "copy" ? current.pending.kind : availableAction

  // One statement moves every selected row (plan item 1.6), and the overlay
  // moves them on screen in the same tick (plan item 1.5).
  async function update() {
    if (!availableAction || !context || running.current) return
    const operation = Symbol()
    running.current = operation
    const ids = selected.map(row => row.id)
    setState(previous => ({ ...previous, pending: { kind: availableAction, count: ids.length }, error: "", failedCount: 0, message: "" }))
    announce(`Working on ${ids.length} selected ${ids.length === 1 ? "Request" : "Requests"}.`, { key: "selection" })
    const outcome = await optimisticBatch({
      ids,
      patch: availableAction === "pick-up" ? { kind: "pick-up", status: "in_progress" } : { kind: "done", status: "done" },
      run: () => (availableAction === "pick-up" ? pickUpRequests : markDoneMany)(ids, context),
    })
    // A navigation during a pending response must not touch the new view.
    if (activeScope.current !== scope || running.current !== operation) return
    running.current = null
    restoreAfterCommit.current = true
    const failed = outcome.status === "success" ? outcome.failed.map(item => item.id) : ids
    const reasons = new Set(outcome.status === "success" ? outcome.failed.map(item => item.error) : outcome.thrown ? [] : [outcome.error])
    const succeeded = outcome.status === "success" ? outcome.moved : []
    setState({ scope, ids: failed, pending: null, failedCount: failed.length,
      error: [...reasons].join(" "),
      // Done confirms through the toast, which also carries the way back.
      message: failed.length || availableAction === "done" ? "" : `${requestCount(ids.length)} picked up.`,
    })
    // Done confirms through its toast and a failure through the bar's alert; a clean pick up speaks here.
    if (!failed.length && availableAction === "pick-up") announce(`${requestCount(ids.length)} picked up.`, { key: "selection" })
    if (availableAction === "done" && succeeded.length) confirmDone(succeeded, context)
  }

  function confirmDone(ids: string[], scopeContext: { orgId: string }) {
    const noun = ids.length === 1 ? "Request" : "Requests"
    toast({ type: "success", title: `${ids.length} ${noun} marked Done`, duration: 10_000,
      action: { label: "Undo", onClick: toastId => void undoDone(toastId, ids, noun, scopeContext) } })
  }

  // Every row moves back in the same tick; each Undo is its own guarded action.
  async function undoDone(toastId: string, ids: string[], noun: string, scopeContext: { orgId: string }) {
    updateToast(toastId, { type: "loading", title: "Undoing", description: `Moving ${ids.length} ${noun} back to In Progress.`, action: undefined })
    const outcomes = await Promise.all(ids.map(id => optimistic({
      id,
      patch: { kind: "undo", status: "in_progress" },
      run: () => undoMarkDone(id, scopeContext),
      waitForPending: true,
      // One summary toast and one re-sync for the whole batch, below.
      onError: () => {},
      refreshOnError: false,
    })))
    const failed = outcomes.filter(outcome => outcome.status !== "success").length
    // Successful undos revalidated the list in their own responses; a failed
    // one did not, so re-sync the rows it left behind.
    if (failed) refresh()
    // The result reuses the toast's id: an update if it is still showing, a fresh toast if it was dismissed meanwhile.
    if (failed) toast({ id: toastId, type: "error", title: `${failed} of ${ids.length} could not be undone`, description: "Those stay Done. Refresh to see their current state." })
    else toast({ id: toastId, type: "success", title: `${ids.length} ${noun} back In Progress`, description: undefined })
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
      if (activeScope.current === scope && running.current === operation) setState(previous => ({ ...previous, pending: null, error: "Links could not be copied. Try again." }))
    } finally { if (running.current === operation) running.current = null }
  }

  const failure = current.failedCount
  const error = failure ? `${failure} ${failure === 1 ? "Request could not be updated." : "Requests could not be updated."} ${selected.length === failure ? `${failure === 1 ? "It is" : "They are"} still selected. Try again.` : "Some Requests have left this view. Refresh to see their current state."}${current.error ? ` ${current.error}` : ""}` : current.error
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
