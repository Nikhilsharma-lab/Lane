"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateOrganization } from "@/app/actions/settings";

interface Props {
  org: { name: string; slug: string; plan: string };
  isAdmin: boolean;
}

const planLabel: Record<string, string> = { free: "Free", pro: "Pro", enterprise: "Enterprise" };

export function WorkspaceForm({ org, isAdmin }: Props) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null); setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateOrganization(formData);
      if (result?.error) setError(result.error);
      else setSuccess(true);
    });
  }

  if (!isAdmin) {
    return (
      <div className="space-y-5">
        <div><p className="text-xs text-[var(--text-secondary)] mb-1.5">Organization name</p><p className="text-sm text-[var(--text-primary)]">{org.name}</p></div>
        <div><p className="text-xs text-[var(--text-secondary)] mb-1.5">Slug</p><p className="text-sm text-[var(--text-primary)] font-mono">{org.slug}</p></div>
        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-1.5">Plan</p>
          <span className="text-xs bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded px-2 py-0.5">{planLabel[org.plan] ?? org.plan}</span>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">Contact your admin to change workspace settings.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Organization name</label>
        <input name="name" type="text" required defaultValue={org.name}
          className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors" />
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Slug</label>
        <input name="slug" type="text" required defaultValue={org.slug} pattern="[a-z0-9-]+"
          className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] font-mono placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors" />
        <p className="text-xs text-yellow-600/80 mt-1">Changing the slug will break any existing shared links.</p>
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Plan</label>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-[var(--bg-hover)] border border-[var(--border)] text-[var(--text-primary)] rounded px-2 py-0.5">{planLabel[org.plan] ?? org.plan}</span>
          <Link href="/settings/plan" className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">View plan &rarr;</Link>
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">Saved.</p>}
      <button type="submit" disabled={isPending}
        className="bg-[var(--accent)] text-[var(--accent-text)] rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
