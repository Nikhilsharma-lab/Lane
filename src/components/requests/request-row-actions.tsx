"use client"

import { useCallback, useMemo, type ReactNode } from "react"
import { Copy } from "lucide-react"
import type { ContextMenuItem } from "@/components/arc/context-menu/context-menu"
import type { OverviewRequest } from "@/lib/request-overview"
import { formatRequestCode } from "@/lib/request-code"
import { type RequestPriority } from "@/lib/request-constants"
import { allowedMove, type AllowedMove, type LifecycleMove } from "@/lib/request-lifecycle"
import { usePendingMutations } from "./pending-mutations-provider"
import { useListAnnouncer } from "./list-announcer"
import { restoreRequestFocus, rowIndexOf } from "./list-focus"
import { useRequestMoves } from "./request-moves"
import { priorityOptions } from "./priority-options"
import { PriorityGlyph, RequestRowPresentation, StatusGlyph, type RequestIdentity } from "./row-presentation"
import { statuses } from "./tasks/statuses"

type Move = LifecycleMove

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
  const overlay = usePendingMutations()
  // Plan item 2.4: optimistic changes speak in the list's one region when the patch begins.
  const announce = useListAnnouncer()
  const { orgId } = context

  // Codes and priorities read through the overlay, so a priority change shows at once.
  const rows = useMemo(() => overlay ? overlay.apply(requests) : requests, [overlay, requests])
  const identities = useStableIdentities(rows)

  // A status change regroups the row and can replace its DOM. Keep the person
  // on the moved Request's row, which follows it into its new group (plan
  // item 2.4). When the view no longer shows it (a status filter, another
  // page), focus the row that took its place and say where it went.
  const restoreFocus = useCallback((id: string, name: string) => {
    const index = rowIndexOf(id)
    requestAnimationFrame(() => {
      const restored = restoreRequestFocus(id, { index })
      if (restored !== "row" && restored !== "none") announce(`${name} left this view.`, { key: "row-left" })
    })
  }, [announce])

  // Plan item 2.5: the moves, their toasts and their copy live in request-moves.ts, shared with Request detail.
  const moves = useRequestMoves({ orgId, announce, afterMove: restoreFocus })
  const { copy, setPriority: setRequestPriority } = moves
  const startMove = moves.move
  const move = useCallback((request: OverviewRequest, kind: Move) => {
    void startMove({ id: request.id, name: identities[request.id]?.code || (request.reframedProblem ?? request.title) }, kind)
  }, [identities, startMove])
  const setPriority = useCallback((request: OverviewRequest, priority: RequestPriority) => { void setRequestPriority(request.id, priority) }, [setRequestPriority])

  // One stable builder: it changes only with identities or the guest flag, and
  // memoised rows call it only when they re-render (plan item 1.14).
  const menuItems = useMemo(() => {

    function statusItems(request: OverviewRequest, next: AllowedMove | null): ContextMenuItem[] {
      return statuses.map(status => {
        const current = request.status === status.value
        const transition = next?.to === status.value ? next : undefined
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
      return priorityOptions.map(({ value: priority, label, icon }) => ({
        id: priority,
        label,
        icon,
        checked: current === priority,
        disabled: isGuest || !request.canEdit || request.status !== "open",
        onSelect: isGuest || !request.canEdit || request.status !== "open" || current === priority ? undefined : () => setPriority(request, priority),
      }))
    }

    return (request: OverviewRequest): ContextMenuItem[] => {
      const identity = identities[request.id] ?? { code: "", priority: request.priority ?? "none" }
      // The one shared rule (plan item 2.4): the row, the bulk bar and detail offer the same move.
      const next = allowedMove(request, { isGuest })
      return [
        // The lifecycle verb sits at the top; the Status submenu keeps the full picture.
        ...(next ? [{ id: "lifecycle", label: next.label, icon: <StatusGlyph status={next.to} />, onSelect: () => move(request, next.move) }] : []),
        { id: "status", label: "Status", separatorBefore: Boolean(next), icon: <StatusGlyph status={request.status} />, children: statusItems(request, next) },
        ...(request.status !== "done" ? [{ id: "priority", label: "Priority", icon: <PriorityGlyph priority={identity.priority} />, children: priorityItems(request, identity.priority) }] : []),
        { id: "copy", label: "Copy", separatorBefore: true, icon: <Copy />, children: [
          ...(identity.code ? [{ id: "code", label: "Copy code", onSelect: () => void copy(identity.code, "Code") }] : []),
          { id: "title", label: "Copy title", onSelect: () => void copy(request.reframedProblem ?? request.title, "Title") },
          { id: "link", label: "Copy link", onSelect: () => void copy(new URL(`/requests/${request.id}`, window.location.origin).href, "Link") },
        ] },
      ]
    }
  }, [copy, identities, isGuest, move, setPriority])

  const presentation = useMemo(() => ({ identities, menuItems }), [identities, menuItems])

  return <RequestRowPresentation value={presentation}>{children}</RequestRowPresentation>
}
