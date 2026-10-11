"use client"

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react"
import { Copy } from "lucide-react"
import type { ContextMenuItem } from "@/components/arc/context-menu/context-menu"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { markDone, pickUpRequest, setRequestPriority, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import type { OverviewRequest } from "@/lib/request-overview"
import { formatRequestCode } from "@/lib/request-code"
import { REQUEST_PRIORITIES, REQUEST_PRIORITY_LABELS, type RequestPriority } from "@/lib/request-constants"
import { usePendingMutations } from "./pending-mutations-provider"
import { FAILURE_TITLE, useOptimisticAction } from "./use-optimistic-action"
import { PriorityGlyph, RequestRowPresentation, StatusGlyph, type RequestIdentity } from "./row-presentation"
import { statuses } from "./tasks/statuses"

type Status = OverviewRequest["status"]
type Move = "pick-up" | "done"

/** Identities depend only on each row's code and priority, so a response that
 * only moved statuses keeps the same object and does not re-render every row. */
function useStableIdentities(rows: OverviewRequest[]) {
  const key = rows.map(request => `${request.id}:${request.requestNumber || ""}:${request.priority ?? "none"}`).join("|")
  return useMemo(() => Object.fromEntries(key ? key.split("|").map(entry => {
    const [id, number, priority] = entry.split(":")
    return [id, { code: number ? formatRequestCode(Number(number)) : "", priority: priority as RequestPriority } satisfies RequestIdentity]
  }) : []), [key])
}

/** Supplies saved codes, saved priorities and guarded actions to Request rows.
 * Status moves only along the existing lifecycle (pick up, mark Done) through the
 * same actions as the detail page, plus the time-boxed undo of a Done move;
 * nothing here grants a guest more than today. Every move goes through the
 * pending-mutation overlay, so the row changes in the next frame (plan item 1.5). */
export function RequestRowActions({ requests, context, isGuest, children }: {
  requests: OverviewRequest[]
  context: { orgId: string }
  isGuest: boolean
  children: ReactNode
}) {
  const { toast, update } = useToastStack()
  const optimistic = useOptimisticAction()
  const overlay = usePendingMutations()
  const [message, setMessage] = useState("")
  const busy = useRef(new Set<string>())
  const { orgId } = context

  // Codes and priorities read through the overlay, so a priority change shows at once.
  const rows = useMemo(() => overlay ? overlay.apply(requests) : requests, [overlay, requests])
  const identities = useStableIdentities(rows)

  // A status change regroups the row and can replace its DOM. Keep the person
  // on the moved Request, or on the filter control when it is no longer shown.
  const restoreFocus = useCallback((id: string) => {
    requestAnimationFrame(() => {
      const link = document.getElementById(`request-${id}`)
      const visible = link?.getClientRects().length && !link.closest("[hidden],[inert]")
      const target = visible ? link : document.querySelector<HTMLButtonElement>('[aria-label="Filter Requests by title"]')
      target?.focus({ preventScroll: true })
    })
  }, [])

  // Results reuse the toast's id: an update if it is still showing, a fresh toast if it was dismissed meanwhile.
  // Undo is sent only after the Done move it reverses has succeeded.
  const undo = useCallback(async (toastId: string, requestId: string, name: string) => {
    update(toastId, { type: "loading", title: "Undoing", description: `${name} is moving back to In Progress.`, action: undefined })
    const outcome = await optimistic({
      id: requestId,
      patch: { kind: "undo", status: "in_progress" },
      run: () => undoMarkDone(requestId, { orgId }),
      waitForPending: true,
      onError: description => { toast({ id: toastId, type: "error", title: "Could not undo", description }) },
    })
    if (outcome.status !== "success") return
    toast({ id: toastId, type: "success", title: "Back In Progress", description: `${name} is In Progress again.` })
    restoreFocus(requestId)
  }, [optimistic, orgId, restoreFocus, toast, update])

  /** One toast per move: Done confirms at once with Undo, and a failure replaces that same toast. */
  const move = useCallback((request: OverviewRequest, kind: Move) => {
    const key = `${request.id}:${kind}`
    if (busy.current.has(key)) return
    busy.current.add(key)
    const name = identities[request.id]?.code || (request.reframedProblem ?? request.title)
    const toastId = kind === "done"
      // Done leaves the working views, so its confirmation carries the way back.
      ? toast({ type: "success", title: "Marked Done", description: `${name} is now Done.`, duration: 10_000,
        action: { label: "Undo", onClick: id => void undo(id, request.id, name) } })
      : null
    void optimistic({
      id: request.id,
      patch: kind === "done" ? { kind: "done", status: "done" } : { kind: "pick-up", status: "in_progress" },
      run: () => (kind === "done" ? markDone : pickUpRequest)(request.id, { orgId }),
      waitForPending: true,
      onError: toastId ? description => { toast({ id: toastId, type: "error", title: FAILURE_TITLE, description, action: undefined }) } : undefined,
    }).then(outcome => {
      if (outcome.status === "success" && kind === "pick-up") setMessage("Picked up. The Request is now In Progress.")
    }).finally(() => { busy.current.delete(key) })
    restoreFocus(request.id)
  }, [identities, optimistic, orgId, restoreFocus, toast, undo])

  const setPriority = useCallback((request: OverviewRequest, priority: RequestPriority) => {
    void optimistic({
      id: request.id,
      patch: { kind: "priority", priority },
      run: () => setRequestPriority(request.id, priority, { orgId }),
    }).then(outcome => {
      if (outcome.status === "success") setMessage(`Priority set to ${REQUEST_PRIORITY_LABELS[priority].toLowerCase()}.`)
    })
  }, [optimistic, orgId])

  const copy = useCallback(async (value: string, label: string) => {
    try { await navigator.clipboard.writeText(value); setMessage(`${label} copied.`) }
    catch { toast({ type: "error", title: "Could not copy", description: "Select the text and copy it instead." }) }
  }, [toast])

  // One stable builder: it changes only with identities or the guest flag, and
  // memoised rows call it only when they re-render (plan item 1.14).
  const menuItems = useMemo(() => {

    /** The one lifecycle move a member can make from this row, if any. */
    function nextStep(request: OverviewRequest): { status: Status; label: string; move: Move } | null {
      if (isGuest) return null
      if (request.status === "open") return { status: "in_progress", label: "Pick up", move: "pick-up" }
      if (request.status === "in_progress") return { status: "done", label: "Mark Done", move: "done" }
      return null
    }

    function statusItems(request: OverviewRequest, next: ReturnType<typeof nextStep>): ContextMenuItem[] {
      return statuses.map(status => {
        const current = request.status === status.value
        const transition = next?.status === status.value ? next : undefined
        return {
          id: status.value,
          label: current || !transition ? status.label : `${status.label} (${transition.label.toLowerCase()})`,
          icon: <StatusGlyph status={status.value} />,
          checked: current,
          disabled: !transition,
          onSelect: transition ? () => move(request, transition.move) : undefined,
        }
      })
    }

    function priorityItems(request: OverviewRequest, current: RequestPriority): ContextMenuItem[] {
      return REQUEST_PRIORITIES.map(priority => ({
        id: priority,
        label: REQUEST_PRIORITY_LABELS[priority],
        icon: <PriorityGlyph priority={priority} />,
        checked: current === priority,
        disabled: isGuest,
        onSelect: isGuest || current === priority ? undefined : () => setPriority(request, priority),
      }))
    }

    return (request: OverviewRequest): ContextMenuItem[] => {
      const identity = identities[request.id] ?? { code: "", priority: request.priority ?? "none" }
      const next = nextStep(request)
      return [
        // The lifecycle verb sits at the top; the Status submenu keeps the full picture.
        ...(next ? [{ id: "lifecycle", label: next.label, icon: <StatusGlyph status={next.status} />, onSelect: () => move(request, next.move) }] : []),
        { id: "status", label: "Status", separatorBefore: Boolean(next), icon: <StatusGlyph status={request.status} />, children: statusItems(request, next) },
        { id: "priority", label: "Priority", icon: <PriorityGlyph priority={identity.priority} />, children: priorityItems(request, identity.priority) },
        { id: "copy", label: "Copy", separatorBefore: true, icon: <Copy size={16} />, children: [
          ...(identity.code ? [{ id: "code", label: "Copy code", onSelect: () => void copy(identity.code, "Code") }] : []),
          { id: "title", label: "Copy title", onSelect: () => void copy(request.reframedProblem ?? request.title, "Title") },
          { id: "link", label: "Copy link", onSelect: () => void copy(new URL(`/requests/${request.id}`, window.location.origin).href, "Link") },
        ] },
      ]
    }
  }, [copy, identities, isGuest, move, setPriority])

  const presentation = useMemo(() => ({ identities, menuItems }), [identities, menuItems])

  return <RequestRowPresentation value={presentation}>
    {children}
    <span className="sr-only" role="status">{message}</span>
  </RequestRowPresentation>
}
