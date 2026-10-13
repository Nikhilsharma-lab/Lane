"use client";

import { useRef, useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { useRecoverableAction } from "@/hooks/use-recoverable-action";
import { useOptionalDetailRequest } from "@/components/requests/detail-context";
import { useListAnnouncer } from "@/components/requests/list-announcer";
import { usePendingMutations } from "@/components/requests/pending-mutations-provider";
import { useRequestMoves } from "@/components/requests/request-moves";
import { allowedMove, type LifecycleMove, type RequestStatus } from "@/lib/request-lifecycle";

const NETWORK_ERRORS: Record<LifecycleMove, string> = {
  "pick-up": "Couldn’t confirm pickup. Refreshing now. Try again if this Request is still Open.",
  done: "Couldn’t confirm completion. Refreshing now. Try again if this Request is still In Progress.",
};

/**
 * Plan item 2.5: Request detail's action slot, in the strip at every width.
 * One filled button for the one move this viewer may make (allowedMove, the
 * rule the row menu and the bulk bar share), or nothing. The move runs
 * through useRequestMoves, the list's own: Pick up is said in the polite
 * region, Mark Done confirms in a toast with Undo, and the page shows the
 * new status in the next frame through the overlay.
 */
export function LifecycleButtons({
  requestId,
  status,
  context,
  isGuest = false,
}: {
  requestId: string;
  status: RequestStatus;
  context: { orgId: string };
  /** A guest has no lifecycle move (plan item 2.4); detail also hides the slot for guests. */
  isGuest?: boolean;
}) {
  const { pending, run } = useRecoverableAction();
  const overlay = usePendingMutations();
  const detail = useOptionalDetailRequest();
  const announce = useListAnnouncer();
  const moves = useRequestMoves({ orgId: context.orgId, announce });
  const slot = useRef<HTMLDivElement>(null);
  // The status the button was pressed from, so the pressed button keeps its
  // pending label and stays disabled while the overlay already shows the new
  // status elsewhere. This is the double-submit guard: a second press would
  // otherwise land on the freshly mounted Mark Done.
  const [pressedFrom, setPressedFrom] = useState<RequestStatus | null>(null);
  const shownStatus = overlay ? overlay.applyOne({ id: requestId, status }).status : status;
  const buttonStatus = pending && pressedFrom ? pressedFrom : shownStatus;

  async function runMove(kind: LifecycleMove) {
    setPressedFrom(shownStatus);
    const hadFocus = Boolean(slot.current?.contains(document.activeElement));
    // On a refusal or a lost response useOptimisticAction rolls the patch back
    // and calls router.refresh() so the detail re-syncs with the server; a
    // success already carries the revalidated tree, so nothing refreshes then.
    const outcome = await run(() => moves.move({ id: requestId, name: detail?.name ?? "This Request" }, kind, {
      networkError: NETWORK_ERRORS[kind],
      assignee: kind === "pick-up" && detail ? detail.viewer : undefined,
    }));
    if (outcome.status !== "completed" || outcome.value.status !== "success" || !hadFocus) return;
    // Focus stays with the person: on the new Mark Done after a pick up, on the title once nothing is left to press.
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body && !slot.current?.contains(active)) return;
      const next = slot.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      (next ?? document.getElementById("request-title"))?.focus({ preventScroll: true });
    });
  }

  const move = allowedMove({ status: buttonStatus }, { isGuest });
  if (!move) return null;

  return (
    <div ref={slot} data-slot="request-lifecycle-actions" className="flex items-center">
      {/* Keyed by the move, so a finished pick up mounts a fresh Mark Done button. */}
      <Button
        key={move.move}
        size="sm"
        onClick={() => { void runMove(move.move); }}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        {pending && (
          <LoaderCircleIcon
            aria-hidden="true"
            data-icon="inline-start"
            className="animate-spin motion-reduce:animate-none"
          />
        )}
        {pending ? (move.move === "pick-up" ? "Picking up…" : "Completing…") : move.label}
      </Button>
    </div>
  );
}
