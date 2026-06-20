"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateMemberRole, removeMember } from "./actions";

const ROLE_LEVEL: Record<string, number> = { owner: 30, admin: 20, member: 10, guest: 5 };

export function MemberRow({
  member,
  context,
  callerRole,
  isCurrentUser,
}: {
  member: {
    userId: string;
    fullName: string | null;
    email: string | null;
    profileRole: string | null;
    role: "owner" | "admin" | "member" | "guest";
  };
  context: { userId: string; orgId: string };
  callerRole: "owner" | "admin" | "member" | "guest";
  isCurrentUser: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const canManage =
    (callerRole === "owner" || callerRole === "admin") &&
    !isCurrentUser &&
    ROLE_LEVEL[member.role] < ROLE_LEVEL[callerRole];

  function handleRoleChange(newRole: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateMemberRole(
        { targetUserId: member.userId, newRole },
        context
      );
      if ("error" in result && result.error) setError(result.error);
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeMember(member.userId, context);
      setConfirmOpen(false);
      if ("error" in result && result.error) setError(result.error);
    });
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div>
        <p className="font-medium">
          {member.fullName ?? "Unknown"}
          {isCurrentUser && (
            <span className="ml-2 text-xs text-muted-foreground">(you)</span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">{member.email}</p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        {member.profileRole && (
          <Badge variant="outline" className="capitalize">
            {member.profileRole}
          </Badge>
        )}
        {canManage ? (
          <Select
            value={member.role}
            onValueChange={handleRoleChange}
            disabled={isPending}
          >
            <SelectTrigger size="sm" className="w-24 text-xs capitalize">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="guest">Guest</SelectItem>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary" className="capitalize">
            {member.role}
          </Badge>
        )}
        {canManage && (
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={isPending}
              className="rounded px-2 py-1 text-xs text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
            >
              Remove
            </button>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10">
                  <AlertTriangle className="size-5 text-destructive" />
                </AlertDialogMedia>
                <AlertDialogTitle>
                  Remove {member.fullName ?? "this member"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  They will no longer have access to this workspace.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={handleRemove}
                  disabled={isPending}
                >
                  {isPending ? "Removing…" : "Remove"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
