"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeOnboarding } from "./actions";

const ROLES = [
  { value: "pm", label: "Product Manager", helper: "Creates requests" },
  { value: "designer", label: "Designer", helper: "Picks up requests" },
  { value: "developer", label: "Developer", helper: "Collaborates on requests" },
] as const;

export function OnboardingForm({ fullName }: { fullName: string }) {
  const [role, setRole] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState(`${fullName}'s Workspace`);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!role) {
      setError("Pick a role to continue.");
      return;
    }
    if (!workspaceName.trim()) {
      setError("Workspace name is required.");
      return;
    }

    setPending(true);
    setError(null);
    const result = await completeOnboarding({
      workspaceName: workspaceName.trim(),
      role,
    });
    if (result?.error) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Role picker */}
      <div className="space-y-2">
        <Label>What best describes your role?</Label>
        <div className="space-y-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => { setRole(r.value); setError(null); }}
              className={`w-full rounded-lg border-2 p-4 text-left transition-all ${
                role === r.value
                  ? "border-foreground bg-muted"
                  : "border-border hover:border-muted-foreground/50 hover:bg-muted/50"
              }`}
            >
              <p className="font-medium">{r.label}</p>
              <p className="text-sm text-muted-foreground">{r.helper}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Workspace name */}
      <div className="space-y-2">
        <Label htmlFor="workspaceName">Workspace name</Label>
        <Input
          id="workspaceName"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          placeholder="My Team"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Your team will see this name. You can change it later.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        className="w-full"
        disabled={pending}
      >
        {pending ? "Creating workspace..." : "Get started"}
      </Button>
    </form>
  );
}
