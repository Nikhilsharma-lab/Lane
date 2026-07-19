"use client";

import { useState } from "react";
import { AuthAction } from "@/components/auth/auth-action";
import { useRecoverableAction } from "@/components/auth/use-recoverable-action";
import { Feedback } from "@/components/ui/feedback";
import { acceptInvite } from "./actions";

export function AcceptInviteButton({
  token,
  workspaceName,
}: {
  token: string;
  workspaceName: string;
}) {
  const { pending, run } = useRecoverableAction();
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setError(null);
    const outcome = await run(() => acceptInvite(token));
    if (outcome.status === "failed") {
      setError(
        "Lane couldn’t join this workspace. Check your connection and try again."
      );
      return;
    }
    if (outcome.status !== "completed") return;

    const result = outcome.value;
    if (result?.error) {
      setError(result.error);
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
