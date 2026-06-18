"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "./actions";

export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setPending(true);
    setError(null);
    const result = await acceptInvite(token);
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      <Button onClick={handleAccept} disabled={pending} className="w-full">
        {pending ? "Joining..." : "Accept invite"}
      </Button>
    </div>
  );
}
