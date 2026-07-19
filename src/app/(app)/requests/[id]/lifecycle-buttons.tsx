"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movedTo, setMovedTo] = useState<
    "in_progress" | "done" | null
  >(null);
  const router = useRouter();

  async function handlePickUp() {
    setPending(true);
    setError(null);
    const result = await pickUpRequest(requestId, context);
    setPending(false);
    if ("error" in result && result.error) {
      setError(result.error);
    } else {
      setMovedTo("in_progress");
      router.refresh();
    }
  }

  async function handleMarkDone() {
    setPending(true);
    setError(null);
    const result = await markDone(requestId, context);
    setPending(false);
    if ("error" in result && result.error) {
      setError(result.error);
    } else {
      setMovedTo("done");
      router.refresh();
    }
  }

  if (status === "done" && !error && !movedTo) return null;

  return (
    <div className={cn("flex flex-col items-start gap-2", fullWidth && "w-full")}>
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
          aria-busy={pending}
          className={cn(fullWidth && "w-full")}
        >
          {pending ? "Picking up…" : "Pick up"}
        </Button>
      )}

      {status === "in_progress" && (
        <Button
          size="sm"
          onClick={handleMarkDone}
          disabled={pending}
          aria-busy={pending}
          className={cn(fullWidth && "w-full")}
        >
          {pending ? "Completing…" : "Mark done"}
        </Button>
      )}
    </div>
  );
}
