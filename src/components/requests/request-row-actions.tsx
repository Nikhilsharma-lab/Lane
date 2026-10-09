"use client"

import { useRouter } from "next/navigation"
import { useRef, useState, type ReactNode } from "react"
import { Copy } from "lucide-react"
import type { ContextMenuItem } from "@/components/arc/context-menu/context-menu"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { markDone, pickUpRequest, setRequestPriority } from "@/app/(app)/requests/[id]/actions"
import type { OverviewRequest } from "@/lib/request-overview"
import { formatRequestCode } from "@/lib/request-code"
import { REQUEST_PRIORITIES, REQUEST_PRIORITY_LABELS, type RequestPriority } from "@/lib/request-properties"
import { PriorityGlyph, RequestRowPresentation, StatusGlyph, type RequestIdentity } from "./row-presentation"
import { statuses } from "./tasks/statuses"

type Status = OverviewRequest["status"]
type ActionResult = { error?: string }
type Transition = { label: string; act: () => Promise<ActionResult>; done: string }

/** Supplies saved codes, saved priorities and guarded actions to Request rows.
 * Status moves only along the existing lifecycle (pick up, mark Done) through the
 * same actions as the detail page; nothing here grants a guest more than today. */
export function RequestRowActions({ requests, context, isGuest, children }: {
  requests: OverviewRequest[]
  context: { orgId: string }
  isGuest: boolean
  children: ReactNode
}) {
  const router = useRouter()
  const { toast } = useToastStack()
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

  async function run(id: string, operation: () => Promise<ActionResult>, done: string) {
    if (busy.current.has(id)) return
    busy.current.add(id)
    try {
      const result = await operation()
      if (result.error) {
        toast({ type: "error", title: "Could not update this Request", description: result.error })
        return
      }
      setMessage(done)
      router.refresh()
      restoreFocus(id)
    } catch {
      toast({ type: "error", title: "Could not update this Request", description: "Check your connection and try again." })
    } finally {
      busy.current.delete(id)
    }
  }

  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setMessage(`${label} copied.`) }
    catch { toast({ type: "error", title: "Could not copy", description: "Select the text and copy it instead." }) }
  }

  function statusItems(request: OverviewRequest): ContextMenuItem[] {
    const next: Partial<Record<Status, Transition>> = isGuest ? {} : {
      in_progress: { label: "Pick up", act: () => pickUpRequest(request.id, context), done: "Picked up. The Request is now In Progress." },
      done: { label: "Mark Done", act: () => markDone(request.id, context), done: "Marked Done." },
    }
    const allowed: Record<Status, Status | null> = { open: "in_progress", in_progress: "done", done: null }
    return statuses.map(status => {
      const current = request.status === status.value
      const transition = allowed[request.status] === status.value ? next[status.value] : undefined
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
    return [
      { id: "status", label: "Status", icon: <StatusGlyph status={request.status} />, children: statusItems(request) },
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
