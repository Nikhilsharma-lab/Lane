"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "./actions";

export function AcceptInviteButton({
  token,
  userId,
  fullName,
  email,
}: {
  token: string;
  userId: string;
  fullName: string;
  email: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleAccept() {
    setPending(true);
    setError(null);
    const result = await acceptInvite({ token, userId, fullName, email });
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else {
      router.push("/");
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
