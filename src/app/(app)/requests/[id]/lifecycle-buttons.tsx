"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/arc/button/button";
import { useDelayedBusy } from "@/hooks/use-delayed-busy";
import { useRecoverableAction } from "@/hooks/use-recoverable-action";
import { useOptionalDetailRequest } from "@/components/requests/detail-context";
import { useListAnnouncer } from "@/components/requests/list-announcer";
import { usePendingMutations } from "@/components/requests/pending-mutations-provider";
import { useRequestMoves } from "@/components/requests/request-moves";
import styles from "./lifecycle-buttons.module.css";
import { availableMove, pickupBlockedMessage, type LifecycleMove, type RequestStatus } from "@/lib/request-lifecycle";

const NETWORK_ERRORS: Record<LifecycleMove, string> = {
  "pick-up": "Couldn’t confirm pickup. Refreshing now. Try again if this Request is still Open.",
  done: "Couldn’t confirm completion. Refreshing now. Try again if this Request is still In progress.",
};

/**
 * Plan item 2.5: Request detail's action slot, in the strip at every width.
 * One filled button for the one move this viewer may make (availableMove, the
 * rule the row menu and the bulk bar share), or nothing. The move runs
 * through useRequestMoves, the list's own: Pick up is said in the polite
 * region, Mark Done confirms in a toast with Undo, and the page shows the
 * new status in the next frame through the overlay.
 *
 * #280: the slot shows the next state at once, so after Pick up it already
 * holds Mark Done. Until the move is confirmed that button can't be pressed
 * (the double-submit guard) and looks busy only past the placeholder delay;
 * a refusal rolls the overlay back, and Pick up with it. A Pick up that
 * can't be made yet says why in visible text beside it, never only on hover.
 */
export function LifecycleButtons({
  requestId,
  status,
  context,
  isGuest = false,
  pickupBlockedReason = null,
  pickupRequester = null,
}: {
  requestId: string;
  status: RequestStatus;
  context: { orgId: string };
  /** A guest has no lifecycle move (plan item 2.4); detail also hides the slot for guests. */
  isGuest?: boolean;
  /** Why pickup isn't possible yet (the loader's measurementReadiness). */
  pickupBlockedReason?: string | null;
  /** Set for a viewer who cannot edit the requester's current values. */
  pickupRequester?: string | null;
}) {
  const reasonId = useId();
  const { pending: running, run } = useRecoverableAction();
  const overlay = usePendingMutations();
  const detail = useOptionalDetailRequest();
  const announce = useListAnnouncer();
  const moves = useRequestMoves({ orgId: context.orgId, announce });
  const slot = useRef<HTMLDivElement>(null);
  // Set once the move has started (after any "Pick up anyway?"): from then until the server answers, the button the
  // overlay now shows can't be pressed.
  const [started, setStarted] = useState(false);
  const unconfirmed = running && started;
  const busy = useDelayedBusy(unconfirmed);
  // Whether the person pressed from this slot, so focus follows the button the move puts in its place.
  const keepFocus = useRef(false);
  // On detail the status comes from the full row the provider already put
  // through the overlay. A partial row here would let the overlay judge a
  // pending priority patch against a row without priority. Outside detail (a
  // standalone fixture) the overlay is asked directly.
  const shownStatus = detail?.request.id === requestId ? detail.request.status
    : overlay ? overlay.applyOne({ id: requestId, status }).status : status;
  const move = availableMove({ status: shownStatus, pickupBlockedReason }, { isGuest });
  const shown = move ? `${move.move}:${Boolean(move.blockedReason)}` : null;

  // Focus stays with the person: on the new Mark Done after a pick up (or Pick up again after a refusal), on the
  // title once nothing is left to press.
  useLayoutEffect(() => {
    if (!keepFocus.current) return;
    const active = document.activeElement;
    if (active && active !== document.body && !slot.current?.contains(active)) { keepFocus.current = false; return; }
    const next = slot.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    (next ?? document.getElementById("request-title"))?.focus({ preventScroll: true });
  }, [shown]);

  async function runMove(kind: LifecycleMove) {
    if (kind === "pick-up" && pickupBlockedReason) return;
    // #77: "Pick up anyway?" first when a concern is open or a review is unanswered.
    // Focus is read before the confirmation takes it; the dialog hands it back to the button on close.
    const hadFocus = Boolean(slot.current?.contains(document.activeElement));
    const name = detail?.name ?? "This Request";
    // On a refusal or a lost response useOptimisticAction rolls the patch back
    // and calls router.refresh() so the detail re-syncs with the server; a
    // success already carries the revalidated tree, so nothing refreshes then.
    await run(() => {
      setStarted(false);
      return moves.move({ id: requestId, name, reviewState: detail?.request.reviewState }, kind, {
        networkError: NETWORK_ERRORS[kind],
        assignee: kind === "pick-up" && detail ? detail.viewer : undefined,
        onStart: () => { keepFocus.current = hadFocus; setStarted(true); },
      });
    });
    keepFocus.current = false;
  }

  if (!move) return null;
  if (move.blockedReason) return (
    <div ref={slot} data-slot="request-lifecycle-actions" className={styles.blocked}>
      <p id={reasonId} className={styles.reason}>{pickupBlockedMessage(move.blockedReason, pickupRequester)}</p>
      <Button size="sm" disabled aria-describedby={reasonId} className={styles.greyed}>Pick up</Button>
    </div>
  );

  return (
    <div ref={slot} data-slot="request-lifecycle-actions" className="flex items-center">
      <Button
        key={move.move}
        size="sm"
        className={styles.move}
        // The move it follows isn't confirmed yet: pressing would act on a state the server hasn't saved.
        aria-disabled={unconfirmed || undefined}
        onClick={() => { if (!unconfirmed) void runMove(move.move); }}
        loading={busy}
      >
        {move.label}
      </Button>
    </div>
  );
}
