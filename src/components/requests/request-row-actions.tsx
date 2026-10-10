"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, type ReactNode } from "react"
import { Copy } from "lucide-react"
import type { ContextMenuItem } from "@/components/arc/context-menu/context-menu"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { markDone, pickUpRequest, setRequestPriority, undoMarkDone } from "@/app/(app)/requests/[id]/actions"
import type { OverviewRequest } from "@/lib/request-overview"
import { formatRequestCode } from "@/lib/request-code"
import { REQUEST_PRIORITIES, REQUEST_PRIORITY_LABELS, type RequestPriority } from "@/lib/request-properties"
import { PriorityGlyph, RequestRowPresentation, StatusGlyph, type RequestIdentity } from "./row-presentation"
import { statuses } from "./tasks/statuses"

type Status = OverviewRequest["status"]
type ActionResult = { error?: string }
/** `done` is either the announcement for a quiet move or the confirmation that follows a Done move. */
type Transition = { label: string; act: () => Promise<ActionResult>; done: string | (() => void) }

/** Supplies saved codes, saved priorities and guarded actions to Request rows.
 * Status moves only along the existing lifecycle (pick up, mark Done) through the
 * same actions as the detail page, plus the time-boxed undo of a Done move;
 * nothing here grants a guest more than today. */
export function RequestRowActions({ requests, context, isGuest, children }: {
  requests: OverviewRequest[]
  context: { orgId: string }
  isGuest: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const { toast, update } = useToastStack()
  const [message, setMessage] = useState("")
  const busy = useRef(new Set<string>())

  const identities = Object.fromEntries(requests.map(request => [request.id, {
    code: request.requestNumber ? formatRequestCode(request.requestNumber) : "",
    priority: request.priority ?? "none",
  } satisfies RequestIdentity]))

  // A status change regroups the row and can replace its DOM. Keep the person
  // on the moved Request, or on the filter control when it is no longer shown.
  function restoreFocus(id: string) {
    requestAnimationFrame(() => {
      const link = document.getElementById(`request-${id}`)
      const visible = link?.getClientRects().length && !link.closest("[hidden],[inert]")
      const target = visible ? link : document.querySelector<HTMLButtonElement>('[aria-label="Filter Requests by title"]')
      target?.focus({ preventScroll: true })
    })
  }

  async function run(id: string, operation: () => Promise<ActionResult>, done: string | (() => void)) {
    if (busy.current.has(id)) return
    busy.current.add(id)
    try {
      const result = await operation()
      if (result.error) {
        toast({ type: "error", title: "Could not update this Request", description: result.error })
        return
      }
      if (typeof done === "string") setMessage(done)
      else done()
      router.refresh()
      restoreFocus(id)
    } catch {
      toast({ type: "error", title: "Could not update this Request", description: "Check your connection and try again." })
    } finally {
      busy.current.delete(id)
    }
  }

  // Done leaves the working views, so its confirmation carries the way back.
  // The row's regrouping is the in-place confirmation; the toast adds Undo.
  function confirmDone(request: OverviewRequest) {
    const name = identities[request.id].code || (request.reframedProblem ?? request.title)
    toast({ type: "success", title: "Marked Done", description: `${name} is now Done.`, duration: 10_000,
      action: { label: "Undo", onClick: toastId => void undo(toastId, request.id, name) } })
  }

  // Results reuse the toast's id: an update if it is still showing, a fresh toast if it was dismissed meanwhile.
  async function undo(toastId: string, requestId: string, name: string) {
    update(toastId, { type: "loading", title: "Undoing", description: `${name} is moving back to In Progress.`, action: undefined })
    try {
      const result = await undoMarkDone(requestId, context)
      if (result.error) {
        toast({ id: toastId, type: "error", title: "Could not undo", description: result.error })
        return
      }
      toast({ id: toastId, type: "success", title: "Back In Progress", description: `${name} is In Progress again.` })
      router.refresh()
      restoreFocus(requestId)
    } catch {
      toast({ id: toastId, type: "error", title: "Could not undo", description: "Check your connection and try again." })
    }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setMessage(`${label} copied.`) }
    catch { toast({ type: "error", title: "Could not copy", description: "Select the text and copy it instead." }) }
  }

  /** The one lifecycle move a member can make from this row, if any. */
  function nextStep(request: OverviewRequest): { status: Status; transition: Transition } | null {
    if (isGuest) return null
    if (request.status === "open") return { status: "in_progress", transition: { label: "Pick up", act: () => pickUpRequest(request.id, context), done: "Picked up. The Request is now In Progress." } }
    if (request.status === "in_progress") return { status: "done", transition: { label: "Mark Done", act: () => markDone(request.id, context), done: () => confirmDone(request) } }
    return null
  }

  function statusItems(request: OverviewRequest): ContextMenuItem[] {
    const next = nextStep(request)
    return statuses.map(status => {
      const current = request.status === status.value
      const transition = next?.status === status.value ? next.transition : undefined
      return {
        id: status.value,
        label: current || !transition ? status.label : `${status.label} (${transition.label.toLowerCase()})`,
        icon: <StatusGlyph status={status.value} />,
        checked: current,
        disabled: !transition,
        onSelect: transition ? () => void run(request.id, transition.act, transition.done) : undefined,
      }
    })
  }

  function priorityItems(request: OverviewRequest): ContextMenuItem[] {
    const current = identities[request.id].priority
    return REQUEST_PRIORITIES.map(priority => ({
      id: priority,
      label: REQUEST_PRIORITY_LABELS[priority],
      icon: <PriorityGlyph priority={priority} />,
      checked: current === priority,
      disabled: isGuest,
      onSelect: isGuest || current === priority ? undefined : () => void run(request.id, () => setRequestPriority(request.id, priority as RequestPriority, context), `Priority set to ${REQUEST_PRIORITY_LABELS[priority].toLowerCase()}.`),
    }))
  }

  function menuItems(request: OverviewRequest): ContextMenuItem[] {
    const identity = identities[request.id]
    const next = nextStep(request)
    return [
      // The lifecycle verb sits at the top; the Status submenu keeps the full picture.
      ...(next ? [{ id: "lifecycle", label: next.transition.label, icon: <StatusGlyph status={next.status} />, onSelect: () => void run(request.id, next.transition.act, next.transition.done) }] : []),
      { id: "status", label: "Status", separatorBefore: Boolean(next), icon: <StatusGlyph status={request.status} />, children: statusItems(request) },
      { id: "priority", label: "Priority", icon: <PriorityGlyph priority={identity.priority} />, children: priorityItems(request) },
      { id: "copy", label: "Copy", separatorBefore: true, icon: <Copy size={16} />, children: [
        ...(identity.code ? [{ id: "code", label: "Copy code", onSelect: () => void copy(identity.code, "Code") }] : []),
        { id: "title", label: "Copy title", onSelect: () => void copy(request.reframedProblem ?? request.title, "Title") },
        { id: "link", label: "Copy link", onSelect: () => void copy(new URL(`/requests/${request.id}`, window.location.origin).href, "Link") },
      ] },
    ]
  }

  return <RequestRowPresentation value={{ identities, menuItems }}>
    {children}
    <span className="sr-only" role="status">{message}</span>
  </RequestRowPresentation>
}
