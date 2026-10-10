"use client"

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { markDoneMany, pickUpRequests, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import type { OverviewRequest } from "@/lib/request-overview"
import { useOptimisticAction, useOptimisticBatch, useServerRefresh } from "./use-optimistic-action"

type SelectionState = {
  scope: string; ids: string[]; error: string; failedCount: number; message: string
  pending: { kind: "pick-up" | "done" | "copy"; count: number } | null
}
const emptySelection = (scope: string): SelectionState => ({ scope, ids: [], error: "", failedCount: 0, message: "", pending: null })

export function useRequestSelection(scope: string, rows: OverviewRequest[], context?: { orgId: string }, isGuest = false) {
  const refresh = useServerRefresh()
  const optimistic = useOptimisticAction()
  const optimisticBatch = useOptimisticBatch()
  const { toast, update: updateToast } = useToastStack()
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
  useLayoutEffect(() => {
    activeScope.current = scope
    running.current = null
    return () => { activeScope.current = null; running.current = null; restoreAfterCommit.current = false }
  }, [scope])
  useLayoutEffect(() => {
    if (busy || !restoreAfterCommit.current) return
    restoreAfterCommit.current = false
    const original = returnFocus.current
    if (original?.isConnected && !original.closest("[hidden], [inert]") && !original.matches(":disabled")) original.focus({ preventScroll: true })
    else document.querySelector<HTMLElement>('[data-slot="requests-workspace"] [aria-label="Filter Requests by title"]')?.focus({ preventScroll: true })
  }, [busy, current.ids, scope])

  function clear() {
    if (busy) return
    restoreAfterCommit.current = true
    setState({ ...emptySelection(scope), message: "Selection cleared" })
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
  }
  function selectPage() {
    if (!busy) setState(previous => ({ ...previous, ids: rows.map(row => row.id), error: "", failedCount: 0, message: "" }))
  }

  const availableAction = !isGuest && context && selected.length
    ? selected.every(row => row.status === "open") ? "pick-up" : selected.every(row => row.status === "in_progress") ? "done" : null
    : null
  const action = current.pending && current.pending.kind !== "copy" ? current.pending.kind : availableAction

  // One statement moves every selected row (plan item 1.6), and the overlay
  // moves them on screen in the same tick (plan item 1.5).
  async function update() {
    if (!availableAction || !context || running.current) return
    const operation = Symbol()
    running.current = operation
    const ids = selected.map(row => row.id)
    setState(previous => ({ ...previous, pending: { kind: availableAction, count: ids.length }, error: "", failedCount: 0, message: "" }))
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
      message: failed.length || availableAction === "done" ? "" : `${ids.length} ${ids.length === 1 ? "Request" : "Requests"} picked up.`,
    })
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
      if (activeScope.current === scope && running.current === operation) setState(previous => ({ ...previous, pending: null, message: "Links copied" }))
    } catch {
      if (activeScope.current === scope && running.current === operation) setState(previous => ({ ...previous, pending: null, error: "Links could not be copied. Try again." }))
    } finally { if (running.current === operation) running.current = null }
  }

  const failure = current.failedCount
  const error = failure ? `${failure} ${failure === 1 ? "Request could not be updated." : "Requests could not be updated."} ${selected.length === failure ? `${failure === 1 ? "It is" : "They are"} still selected. Try again.` : "Some Requests have left this view. Refresh to see their current state."}${current.error ? ` ${current.error}` : ""}` : current.error
  return { selected, busy, count: current.pending?.count ?? selected.length, error, message: current.message, action, toggle, selectPage, clear, update, copyLinks, refresh, allSelected: selected.length === rows.length }
}
