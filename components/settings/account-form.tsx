"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/app/actions/settings";

const TIMEZONES = [
  "UTC","America/New_York","America/Chicago","America/Denver","America/Los_Angeles",
  "America/Toronto","America/Sao_Paulo","Europe/London","Europe/Paris","Europe/Berlin",
  "Europe/Madrid","Europe/Rome","Europe/Amsterdam","Europe/Stockholm","Europe/Istanbul",
  "Africa/Cairo","Africa/Lagos","Asia/Dubai","Asia/Kolkata","Asia/Dhaka","Asia/Bangkok",
  "Asia/Singapore","Asia/Shanghai","Asia/Tokyo","Asia/Seoul","Australia/Sydney",
  "Australia/Melbourne","Pacific/Auckland",
];

interface Props {
  profile: { fullName: string; email: string; timezone: string };
}

export function AccountForm({ profile }: Props) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result?.error) setError(result.error);
      else setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Full name</label>
        <input name="fullName" type="text" required defaultValue={profile.fullName}
          className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors" />
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Email</label>
        <input type="email" value={profile.email} disabled
          className="w-full bg-[var(--bg-hover)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-tertiary)] cursor-not-allowed" />
        <p className="text-xs text-[var(--text-tertiary)] mt-1">Email cannot be changed here.</p>
      </div>
      <div>
        <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Timezone</label>
        <select name="timezone" defaultValue={profile.timezone}
          className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors">
          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
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
