"use client";

import { useState } from "react";
import { AuthAction } from "@/components/auth/auth-action";
import { Feedback } from "@/components/ui/feedback";
import { acceptInvite } from "./actions";

export function AcceptInviteButton({
  token,
  workspaceName,
}: {
  token: string;
  workspaceName: string;
}) {
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
    <div className="space-y-3" aria-busy={pending}>
      {error && (
        <Feedback kind="error" variant="inline">
          {error}
        </Feedback>
      )}
      <AuthAction
        onClick={handleAccept}
        loading={pending}
        loadingLabel="Joining workspace…"
      >
        Join {workspaceName}
      </AuthAction>
    </div>
  );
}
