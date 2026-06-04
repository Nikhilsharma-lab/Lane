"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { pickUpRequest, markDone } from "./actions";

export function LifecycleButtons({
  requestId,
  status,
  context,
}: {
  requestId: string;
  status: string;
  context: { userId: string; orgId: string };
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handlePickUp() {
    setPending(true);
    setError(null);
    const result = await pickUpRequest(requestId, context);
    setPending(false);
    if ("error" in result && result.error) {
      setError(result.error);
    } else {
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
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {status === "open" && (
        <Button size="sm" onClick={handlePickUp} disabled={pending}>
          {pending ? "Picking up..." : "Pick up"}
        </Button>
      )}

      {status === "in_progress" && (
        <Button size="sm" onClick={handleMarkDone} disabled={pending}>
          {pending ? "Completing..." : "Mark done"}
        </Button>
      )}
    </div>
  );
}
