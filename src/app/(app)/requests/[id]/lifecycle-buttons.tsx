"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { useRecoverableAction } from "@/components/ui/use-recoverable-action";
import {
  requestListHref,
  type RequestStatusFilter,
} from "@/lib/request-workspace";
import { cn } from "@/lib/utils";
import { pickUpRequest, markDone } from "./actions";

export function LifecycleButtons({
  requestId,
  status,
  context,
  filter,
  fullWidth = false,
}: {
  requestId: string;
  status: string;
  context: { orgId: string };
  filter: RequestStatusFilter;
  fullWidth?: boolean;
}) {
  const { pending, run } = useRecoverableAction();
  const [error, setError] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<
    "in_progress" | "done" | null
  >(null);
  const router = useRouter();

  async function runLifecycleAction(
    action: () => Promise<{ error?: string; success?: boolean }>,
    target: "in_progress" | "done",
    networkError: string
  ) {
    setError(null);
    setMovedTo(null);

    const outcome = await run(action);
    if (outcome.status === "failed") {
      setError(networkError);
      router.refresh();
      return;
    }
    if (outcome.status !== "completed") return;

    const result = outcome.value;
    if ("error" in result && result.error) {
      setError(result.error);
      router.refresh();
    } else {
      setMovedTo(target);
      router.refresh();
    }
  }

  async function handlePickUp() {
    await runLifecycleAction(
      () => pickUpRequest(requestId, context),
      "in_progress",
      "Couldn’t confirm pickup. Refreshing now—try again if this Request remains Open."
    );
  }

  async function handleMarkDone() {
    await runLifecycleAction(
      () => markDone(requestId, context),
      "done",
      "Couldn’t confirm completion. Refreshing now—try again if this Request remains In Progress."
    );
  }

  if (status === "done" && !error && !movedTo) return null;

  return (
    <div
      data-slot="request-lifecycle-actions"
      className={cn(
        "flex flex-col gap-2",
        fullWidth ? "w-full items-start" : "max-w-[320px] items-end"
      )}
    >
      {error && (
        <Feedback kind="error" variant="inline">
          {error}
        </Feedback>
      )}
      {movedTo && (
        <Feedback kind="success" variant="inline">
          Moved to {movedTo === "done" ? "Done" : "In Progress"}.{" "}
          {filter !== "all" && filter !== movedTo && (
            <Link
              href={requestListHref(movedTo)}
              className="font-semibold underline underline-offset-4"
            >
              Show that list
            </Link>
          )}
        </Feedback>
      )}

      {status === "open" && (
        <Button
          size="sm"
          onClick={handlePickUp}
          disabled={pending}
          aria-busy={pending || undefined}
          className={cn(fullWidth && "w-full")}
        >
          {pending && (
            <LoaderCircleIcon
              aria-hidden="true"
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
              strokeWidth={1.8}
            />
          )}
          {pending ? "Picking up…" : "Pick up"}
        </Button>
      )}

      {status === "in_progress" && (
        <Button
          size="sm"
          onClick={handleMarkDone}
          disabled={pending}
          aria-busy={pending || undefined}
          className={cn(fullWidth && "w-full")}
        >
          {pending && (
            <LoaderCircleIcon
              aria-hidden="true"
              data-icon="inline-start"
              className="animate-spin motion-reduce:animate-none"
              strokeWidth={1.8}
            />
          )}
          {pending ? "Completing…" : "Mark done"}
        </Button>
      )}
    </div>
  );
}
