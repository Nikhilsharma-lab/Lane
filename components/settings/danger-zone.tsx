"use client";

import { useState, useTransition } from "react";
import { leaveOrg, deleteOrg } from "@/app/actions/settings";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Props { isAdmin: boolean; orgSlug: string; }

export function DangerZone({ isAdmin, orgSlug }: Props) {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLeave() {
    startTransition(async () => {
      const result = await leaveOrg();
      if (result?.error) { setError(result.error); setShowLeaveConfirm(false); }
    });
  }

  function handleDelete() {
    if (deleteInput !== orgSlug) return;
    startTransition(async () => {
      const result = await deleteOrg(deleteInput);
      if (result?.error) { setError(result.error); setShowDeleteConfirm(false); setDeleteInput(""); }
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Leave workspace</CardTitle>
          <CardDescription>
            You&apos;ll lose access to all requests, designs, and team data.
            {isAdmin && " If you are the only admin, assign another admin first."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showLeaveConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-foreground">Are you sure? This cannot be undone.</p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={handleLeave} disabled={isPending}>
                  {isPending ? "Leaving..." : "Yes, leave"}
                </Button>
                <Button variant="outline" onClick={() => setShowLeaveConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="destructive"
              onClick={() => { setError(null); setShowLeaveConfirm(true); }}
            >
              Leave workspace
            </Button>
          )}
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="ring-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Delete workspace</CardTitle>
            <CardDescription>
              Permanently deletes the org, all members, all requests, and all data. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showDeleteConfirm ? (
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  Type <span className="font-mono text-foreground bg-accent px-1.5 py-0.5 rounded">{orgSlug}</span> to confirm.
                </p>
                <Input
                  type="text"
                  value={deleteInput}
                  onChange={(e) => setDeleteInput(e.target.value)}
                  placeholder={orgSlug}
                  className="font-mono"
                />
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleteInput !== orgSlug || isPending}
                  >
                    {isPending ? "Deleting..." : "Delete workspace"}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowDeleteConfirm(false); setDeleteInput(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="destructive"
                onClick={() => { setError(null); setShowDeleteConfirm(true); }}
              >
                Delete workspace
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
