"use client"

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { markDone, pickUpRequest } from "@/app/(app)/requests/[id]/actions"
import type { OverviewRequest } from "@/lib/request-overview"

type SelectionState = {
  scope: string; ids: string[]; error: string; failedCount: number; message: string
  pending: { kind: "pick-up" | "done" | "copy"; count: number } | null
}
const emptySelection = (scope: string): SelectionState => ({ scope, ids: [], error: "", failedCount: 0, message: "", pending: null })

export function useRequestSelection(scope: string, rows: OverviewRequest[], context?: { orgId: string }, isGuest = false) {
  const router = useRouter()
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

  async function update() {
    if (!availableAction || !context || running.current) return
    const operation = Symbol()
    running.current = operation
    setState(previous => ({ ...previous, pending: { kind: availableAction, count: selected.length }, error: "", failedCount: 0, message: "" }))
    const failed: string[] = []
    const reasons = new Set<string>()
    for (const row of selected) {
      // A navigation during a pending response must not start more work in the old view.
      if (activeScope.current !== scope || running.current !== operation) break
      try {
        const result = await (availableAction === "pick-up" ? pickUpRequest : markDone)(row.id, context)
        if (!result?.success) { failed.push(row.id); if (result?.error) reasons.add(result.error) }
      } catch { failed.push(row.id) }
    }
    if (activeScope.current !== scope || running.current !== operation) return
    running.current = null
    restoreAfterCommit.current = true
    setState({ scope, ids: failed, pending: null, failedCount: failed.length,
      error: [...reasons].join(" "),
      message: failed.length ? "" : `${selected.length} ${selected.length === 1 ? "Request" : "Requests"} ${availableAction === "pick-up" ? "picked up" : "marked Done"}.`,
    })
    router.refresh()
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
  return { selected, busy, count: current.pending?.count ?? selected.length, error, message: current.message, action, toggle, selectPage, clear, update, copyLinks, refresh: () => router.refresh(), allSelected: selected.length === rows.length }
}
