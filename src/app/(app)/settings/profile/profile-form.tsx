"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProfileRole } from "./actions";

type ProductRole = "pm" | "designer" | "developer";

export function ProfileForm({
  initialRole,
  orgId,
}: {
  initialRole: ProductRole;
  orgId: string;
}) {
  const [role, setRole] = useState<ProductRole>(initialRole);
  const [savedRole, setSavedRole] = useState<ProductRole>(initialRole);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const result = await updateProfileRole({ role }, { orgId });
      if ("error" in result && result.error) {
        setFeedback(result.error);
        return;
      }
      setSavedRole(role);
      setFeedback("Profile updated.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="product-role">Role</Label>
        <Select
          value={role}
          onValueChange={(value) => {
            if (value) {
              setRole(value as ProductRole);
              setFeedback(null);
            }
          }}
          disabled={isPending}
        >
          <SelectTrigger id="product-role" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pm">Product Manager</SelectItem>
            <SelectItem value="designer">Designer</SelectItem>
            <SelectItem value="developer">Developer</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          This is a profile label only. It does not change what you can see or do.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending || role === savedRole}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
        {feedback && (
          <p
            role="status"
            className={feedback === "Profile updated." ? "text-sm text-muted-foreground" : "text-sm text-destructive"}
          >
            {feedback}
          </p>
        )}
      </div>
    </form>
  );
}
