"use client";

import { useState } from "react";
import { acceptInvite } from "@/app/actions/invites";

interface Props {
  token: string;
  defaultEmail: string;
  orgName: string;
}

export function InviteSignupForm({ token, defaultEmail, orgName }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const result = await acceptInvite(token, formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
    // on success, acceptInvite calls redirect() so no further action needed
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">Full name</label>
        <input
          name="fullName"
          type="text"
          required
          autoFocus
          placeholder="Your name"
          className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-border/80 transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">Email</label>
        <input
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
          className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-border/80 transition-colors"
        />
      </div>

      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">Password</label>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="Create a password"
          className="w-full bg-muted border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-border/80 transition-colors"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Joining…" : `Join ${orgName}`}
      </button>
    </form>
  );
}
