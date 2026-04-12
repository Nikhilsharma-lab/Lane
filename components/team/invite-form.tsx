"use client";

import { useState, useTransition } from "react";
import { createInvite } from "@/app/actions/invites";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/ui/native-select";

const ROLES = [
  { value: "designer", label: "Designer" },
  { value: "pm", label: "Product Manager" },
  { value: "developer", label: "Developer" },
  { value: "lead", label: "Design Lead" },
];

export function InviteForm() {
  const [isPending, startTransition] = useTransition();
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInviteLink(null);

    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createInvite(formData);
      if (result?.error) {
        setError(result.error);
      } else if (result?.token) {
        const link = `${window.location.origin}/invite/${result.token}`;
        setInviteLink(link);
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  function handleCopy() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="colleague@company.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <NativeSelect
            id="invite-role"
            name="role"
            defaultValue="designer"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" disabled={isPending} className="shrink-0">
          {isPending ? "Generating..." : "Generate invite link"}
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {inviteLink && (
        <div className="flex items-center gap-3 bg-muted border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground font-mono flex-1 truncate">{inviteLink}</p>
          <Button variant="outline" size="xs" onClick={handleCopy} className="shrink-0">
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      )}
    </div>
  );
}
