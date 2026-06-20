"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { pickUpRequest } from "./requests/[id]/actions";

export function PickUpButton({
  requestId,
  title,
  orgId,
}: {
  requestId: string;
  title: string;
  orgId: string;
}) {
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await pickUpRequest(requestId, { orgId });
      if (result?.error) toast.error(result.error);
      // On success the action revalidates "/" and the row moves to In Progress.
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      // Sits above the row's stretched link so clicking it picks up
      // rather than navigating to the detail page.
      className="relative z-10 shrink-0"
      disabled={pending}
      onClick={onClick}
      aria-label={`Pick up request: ${title}`}
    >
      {pending ? "Picking up…" : "Pick it up"}
    </Button>
  );
}
