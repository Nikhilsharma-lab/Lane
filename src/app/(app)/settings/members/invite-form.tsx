"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInvite } from "./actions";

export function InviteForm({
  context,
}: {
  context: { userId: string; orgId: string };
}) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setInviteUrl(null);
    setCopied(false);

    const result = await createInvite({ email }, context);
    setPending(false);

    if ("error" in result && result.error) {
      setError(result.error);
    } else if ("inviteUrl" in result && result.inviteUrl) {
      setInviteUrl(result.inviteUrl);
      setEmail("");
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="email"
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={pending}
          className="flex-1"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Inviting..." : "Invite"}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {inviteUrl && (
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="mb-2 text-sm font-medium">
            Invite link created — share it with your teammate:
          </p>
          <div className="flex gap-2">
            <Input
              value={inviteUrl}
              readOnly
              className="flex-1 bg-background text-xs"
            />
            <Button size="sm" variant="outline" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
