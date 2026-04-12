"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateOrganization } from "@/app/actions/settings";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Organization name</p>
          <p className="text-sm text-foreground">{org.name}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Slug</p>
          <p className="text-sm text-foreground font-mono">{org.slug}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Plan</p>
          <Badge variant="secondary">{planLabel[org.plan] ?? org.plan}</Badge>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="orgName">Organization name</Label>
        <Input id="orgName" name="name" type="text" required defaultValue={org.name} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="orgSlug">Slug</Label>
        <Input id="orgSlug" name="slug" type="text" required defaultValue={org.slug} pattern="[a-z0-9-]+" className="font-mono" />
        <p className="text-xs text-accent-warning/80">Changing the slug will break any existing shared links.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Plan</Label>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{planLabel[org.plan] ?? org.plan}</Badge>
          <Link href="/settings/plan" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            View plan &rarr;
          </Link>
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert>
          <AlertDescription className="text-accent-success">Saved.</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save changes"}
      </Button>
    </form>
  );
}
