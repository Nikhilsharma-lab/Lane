"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const form = e.currentTarget;
    const newPassword = (form.elements.namedItem("newPassword") as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem("confirmPassword") as HTMLInputElement).value;
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) setError(error.message);
      else { setSuccess(true); form.reset(); }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">New password</label>
        <input name="newPassword" type="password" required minLength={8}
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-border/80 transition-colors" />
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">Confirm new password</label>
        <input name="confirmPassword" type="password" required
          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 focus:outline-none focus:border-border/80 transition-colors" />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">Password updated.</p>}
      <button type="submit" disabled={isPending}
        className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40">
        {isPending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
