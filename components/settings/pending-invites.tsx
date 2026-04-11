"use client";

import { useState, useTransition } from "react";
import { revokeInvite } from "@/app/actions/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Invite { id: string; email: string; role: string; expiresAt: Date; acceptedAt: Date | null; }
interface Props { invites: Invite[]; isAdmin: boolean; }

const ROLE_LABELS: Record<string, string> = { pm: "PM", designer: "Designer", developer: "Developer", lead: "Lead", admin: "Admin" };

function isExpired(date: Date) { return new Date() > new Date(date); }
function formatDate(date: Date) { return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

export function PendingInvites({ invites, isAdmin }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const active = invites.filter((i) => !i.acceptedAt && !isExpired(i.expiresAt));
  const expired = invites.filter((i) => !i.acceptedAt && isExpired(i.expiresAt));
  if (active.length === 0 && expired.length === 0) return null;

  function handleRevoke(inviteId: string) {
    startTransition(async () => {
      const result = await revokeInvite(inviteId);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {active.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending invites ({active.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {active.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm text-foreground">{inv.email}</p>
                    <p className="text-xs text-muted-foreground/60">
                      {ROLE_LABELS[inv.role] ?? inv.role} &middot; Expires {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-yellow-500/70 border-yellow-500/30">Pending</Badge>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground/60 hover:text-destructive"
                        onClick={() => handleRevoke(inv.id)}
                        disabled={isPending}
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {expired.length > 0 && (
        <Card className="opacity-50">
          <CardHeader>
            <CardTitle>Expired invites ({expired.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expired.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm text-muted-foreground">{inv.email}</p>
                    <p className="text-xs text-muted-foreground/60">
                      {ROLE_LABELS[inv.role] ?? inv.role} &middot; Expired {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                  <Badge variant="secondary">Expired</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
