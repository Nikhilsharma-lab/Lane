"use client";

import { useState, useTransition } from "react";
import { createInvite } from "@/app/actions/invites";

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
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1.5">Email address</label>
          <input
            name="email"
            type="email"
            required
            placeholder="colleague@company.com"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-border/80 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Role</label>
          <select
            name="role"
            defaultValue="designer"
            className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-border/80 transition-colors"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 shrink-0"
        >
          {isPending ? "Generating…" : "Generate invite link"}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {inviteLink && (
        <div className="flex items-center gap-3 bg-muted border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground font-mono flex-1 truncate">{inviteLink}</p>
          <button
            onClick={handleCopy}
            className="text-xs text-muted-foreground hover:text-foreground border border-border hover:border-border/80 rounded px-2.5 py-1 transition-colors shrink-0"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}
