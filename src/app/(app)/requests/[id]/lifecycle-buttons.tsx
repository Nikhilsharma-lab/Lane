"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Alert } from "@/components/arc/alert/alert";
import { useToastStack } from "@/components/arc/toast-stack/toast-stack";
import { useRecoverableAction } from "@/hooks/use-recoverable-action";
import { usePendingMutations } from "@/components/requests/pending-mutations-provider";
import { useOptimisticAction } from "@/components/requests/use-optimistic-action";
import {
  requestListHref,
  type RequestProjectFilter,
  type RequestStatusFilter,
} from "@/lib/request-workspace";
import { cn } from "@/lib/utils";
import { allowedMove, type RequestStatus } from "@/lib/request-lifecycle";
import { pickUpRequest, markDone } from "./actions";

export function LifecycleButtons({
  requestId,
  status,
  context,
  filter,
  projectFilter = "all",
  fullWidth = false,
  placement = "block",
  isGuest = false,
}: {
  requestId: string;
  status: string;
  context: { orgId: string };
  filter: RequestStatusFilter;
  projectFilter?: RequestProjectFilter;
  fullWidth?: boolean;
  /** "strip" sits in the detail page strip, a fixed 44px row, so its feedback
   * goes to a toast, the channel the list rows use. "block" keeps the inline
   * alerts (plan item 2.0). */
  placement?: "block" | "strip";
  /** A guest has no lifecycle move (plan item 2.4); detail also hides the slot for guests. */
  isGuest?: boolean;
}) {
  const { pending, run } = useRecoverableAction();
  const { toast } = useToastStack();
  const optimistic = useOptimisticAction();
  const overlay = usePendingMutations();
  const [error, setError] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<
    "in_progress" | "done" | null
  >(null);
  // The status the button was pressed from, so the pressed button keeps its
  // pending label while the overlay already shows the new status elsewhere.
  const [pressedFrom, setPressedFrom] = useState<string | null>(null);
  // The overlay shows a move from the list or this page before the server
  // confirms it, and keeps it if a navigation drops the action's payload.
  const shownStatus = overlay
    ? overlay.applyOne({ id: requestId, status: status as "open" | "in_progress" | "done" }).status
    : status;
  const buttonStatus = pending && pressedFrom ? pressedFrom : shownStatus;

  async function runLifecycleAction(
    action: () => Promise<{ error?: string; success?: boolean }>,
    target: "in_progress" | "done",
    networkError: string
  ) {
    setError(null);
    setMovedTo(null);
    setPressedFrom(shownStatus);

    // On a refusal or a lost response useOptimisticAction rolls the patch back
    // and calls router.refresh() so the detail re-syncs with the server; a
    // success already carries the revalidated tree, so nothing refreshes then.
    const outcome = await run(() =>
      optimistic({
        id: requestId,
        patch:
          target === "done"
            ? { kind: "done", status: "done" }
            : { kind: "pick-up", status: "in_progress" },
        run: action,
        waitForPending: true,
        onError: (message, { thrown }) => {
          const text = thrown ? networkError : message;
          if (placement === "strip") toast({ type: "error", title: "Action failed", description: text });
          else setError(text);
        },
      })
    );
    if (outcome.status !== "completed") return;
    if (outcome.value.status !== "success") return;
    if (placement === "strip") toast({ type: "success", title: "Request updated", description: `Moved to ${target === "done" ? "Done" : "In Progress"}.` });
    else setMovedTo(target);
  }

  async function handlePickUp() {
    await runLifecycleAction(
      () => pickUpRequest(requestId, context),
      "in_progress",
      "Couldn’t confirm pickup. Refreshing now. Try again if this Request is still Open."
    );
  }

  async function handleMarkDone() {
    await runLifecycleAction(
      () => markDone(requestId, context),
      "done",
      "Couldn’t confirm completion. Refreshing now. Try again if this Request is still In Progress."
    );
  }

  // The one shared rule (plan item 2.4): the row menu, the bulk bar and this strip offer the same move.
  const move = allowedMove({ status: buttonStatus as RequestStatus }, { isGuest });
  if (!move && !error && !movedTo) return null;

  return (
    <div
      data-slot="request-lifecycle-actions"
      className={cn(
        placement === "strip"
          ? "flex items-center"
          : ["flex flex-col gap-2", fullWidth ? "w-full items-start" : "max-w-[320px] items-end"]
      )}
    >
      {error && (
        <Alert tone="danger" title="Action failed">
          {error}
        </Alert>
      )}
      {movedTo && (
        <Alert tone="success" title="Request updated">
          Moved to {movedTo === "done" ? "Done" : "In Progress"}.{" "}
          {filter !== "all" && filter !== movedTo && (
            <Link
              href={requestListHref(movedTo, projectFilter)}
              className="font-medium underline underline-offset-4"
            >
              View Requests
            </Link>
          )}
        </Alert>
      )}

      {move && (
        // Keyed by the move, so a finished pick up mounts a fresh Mark Done button, as before.
        <Button
          key={move.move}
          size="sm"
          onClick={move.move === "pick-up" ? handlePickUp : handleMarkDone}
          disabled={pending}
          aria-busy={pending || undefined}
          className={cn(fullWidth && "w-full")}
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
      )}
    </div>
  );
}
