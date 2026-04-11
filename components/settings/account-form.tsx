"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/app/actions/settings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
      if (result && "error" in result) setError(result.error);
      else setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" type="text" required defaultValue={profile.fullName} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={profile.email} disabled className="cursor-not-allowed opacity-60" />
        <p className="text-xs text-muted-foreground/60">Email cannot be changed here.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          name="timezone"
          defaultValue={profile.timezone}
          className="h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 py-0.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 md:text-xs/relaxed dark:bg-input/30"
        >
          {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription className="text-green-400">Saved.</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
