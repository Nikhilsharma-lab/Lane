"use client";

import { useState, useTransition } from "react";
import { updateMemberRole, removeMember } from "@/app/actions/settings";
import { InviteForm } from "@/components/team/invite-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NativeSelect } from "@/components/ui/native-select";

const ROLE_LABELS: Record<string, string> = { pm: "PM", designer: "Designer", developer: "Developer", lead: "Lead", admin: "Admin" };
const ROLES = ["pm", "designer", "developer", "lead", "admin"];

interface Member { id: string; fullName: string; email: string; role: string; }
interface Props { members: Member[]; currentUserId: string; isAdmin: boolean; }

export function MembersList({ members, currentUserId, isAdmin }: Props) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(profileId: string, role: string) {
    startTransition(async () => {
      const result = await updateMemberRole(profileId, role);
      if (result?.error) setError(result.error);
    });
  }

  function handleRemove(profileId: string) {
    startTransition(async () => {
      const result = await removeMember(profileId);
      if (result?.error) setError(result.error);
      else setConfirmRemoveId(null);
    });
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Invite member</CardTitle>
          </CardHeader>
          <CardContent>
            <InviteForm />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Team ({members.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between border border-border rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar size="sm">
                    <AvatarFallback>{m.fullName.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm text-foreground">
                      {m.fullName}
                      {m.id === currentUserId && <span className="text-xs text-muted-foreground/60 ml-1.5">(you)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground/60">{m.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isAdmin && m.id !== currentUserId ? (
                    <NativeSelect
                      value={m.role}
                      onChange={(e) => handleRoleChange(m.id, e.target.value)}
                      disabled={isPending}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </NativeSelect>
                  ) : (
                    <Badge variant="secondary">{ROLE_LABELS[m.role] ?? m.role}</Badge>
                  )}
                  {isAdmin && m.id !== currentUserId && (
                    confirmRemoveId === m.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Remove?</span>
                        <Button variant="link" size="xs" className="text-destructive" onClick={() => handleRemove(m.id)} disabled={isPending}>
                          Yes
                        </Button>
                        <Button variant="link" size="xs" onClick={() => setConfirmRemoveId(null)}>
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="xs" className="text-muted-foreground/60 hover:text-destructive" onClick={() => setConfirmRemoveId(m.id)}>
                        Remove
                      </Button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
