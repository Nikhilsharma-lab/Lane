"use client";

import { useState } from "react";
import { acceptInvite } from "@/app/actions/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
      <div className="space-y-1.5">
        <Label htmlFor="invite-fullName">Full name</Label>
        <Input
          id="invite-fullName"
          name="fullName"
          type="text"
          required
          autoFocus
          placeholder="Your name"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-password">Password</Label>
        <Input
          id="invite-password"
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="Create a password"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full"
        size="lg"
      >
        {loading ? "Joining\u2026" : `Join ${orgName}`}
      </Button>
    </form>
  );
}
