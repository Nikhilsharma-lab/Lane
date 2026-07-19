"use client";

import { useState } from "react";
import { CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createInvite } from "./actions";

export function InviteForm({
  context,
}: {
  context: { userId: string; orgId: string };
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin" | "guest">("member");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [emailSent, setEmailSent] = useState<boolean | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setInviteUrl(null);
    setCopied(false);
    setRefreshed(false);
    setEmailSent(null);

    const result = await createInvite({ email, role }, context);
    setPending(false);

    if ("error" in result && result.error) {
      setError(result.error);
    } else if ("inviteUrl" in result && result.inviteUrl) {
      setInviteUrl(result.inviteUrl);
      setRefreshed(!!result.refreshed);
      setEmailSent(result.emailSent === true);
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Label htmlFor="invite-email" className="sr-only">Email address</Label>
        <Input
          id="invite-email"
          type="email"
          placeholder="teammate@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={pending}
          className="min-w-0 flex-1"
        />
        <Select
          value={role}
          onValueChange={(v) => { if (v) setRole(v as "member" | "admin" | "guest"); }}
          disabled={pending}
        >
          <SelectTrigger className="w-full sm:w-28" aria-label="Workspace role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Sending…" : "Send invite"}
        </Button>
      </form>

      {error && (
        <Feedback kind="error" variant="inline">
          {error}
        </Feedback>
      )}

      {inviteUrl && (
        <div className="space-y-2">
          <Feedback
            kind={emailSent ? "success" : "warning"}
            title={
              emailSent
                ? refreshed
                  ? "Invitation emailed again"
                  : "Invitation emailed"
                : "Invite created; email could not be sent"
            }
          >
            {emailSent
              ? "They can join from the email or this link."
              : "The invitation is still ready. Share this link instead."}
          </Feedback>
          <div className="flex min-w-0 gap-2">
            <Input
              aria-label="Invite link"
              value={inviteUrl}
              readOnly
              className="min-w-0 flex-1 bg-background font-mono text-type-micro"
            />
            <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
              <CopyIcon aria-hidden="true" data-icon="inline-start" />
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
