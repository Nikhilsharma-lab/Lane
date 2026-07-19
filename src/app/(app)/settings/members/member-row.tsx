"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Feedback } from "@/components/ui/feedback";
import { IdentityMark } from "@/components/ui/identity-mark";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Row,
  RowActions,
  RowContent,
  RowDescription,
  RowLeading,
  RowTitle,
} from "@/components/ui/row";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateMemberRole, removeMember } from "./actions";

const ROLE_LEVEL: Record<string, number> = { owner: 30, admin: 20, member: 10, guest: 5 };
const FUNCTIONAL_ROLE_LABELS: Record<string, string> = {
  pm: "PM",
  designer: "Designer",
  developer: "Developer",
};
const WORKSPACE_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

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
  const displayName = member.fullName ?? member.email ?? "Unknown member";
  const functionalRole = member.profileRole
    ? FUNCTIONAL_ROLE_LABELS[member.profileRole] ?? member.profileRole
    : null;

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
    <Row className="items-start py-3">
      <RowLeading className="self-start pt-0.5">
        <IdentityMark
          label={member.fullName ?? member.email}
          kind={member.fullName || member.email ? "person" : "unknown"}
        />
      </RowLeading>
      <RowContent>
        <RowTitle className="flex items-center gap-2">
          <span className="truncate">{displayName}</span>
          {isCurrentUser && (
            <span className="shrink-0 font-mono text-type-micro tracking-[0.04em] text-brand">
              YOU
            </span>
          )}
        </RowTitle>
        <RowDescription className="truncate">
          {functionalRole && <>{functionalRole} · </>}
          {member.email ?? "Email unavailable"}
        </RowDescription>
        {error && (
          <div className="mt-1.5">
            <Feedback kind="error" variant="inline">
              {error}
            </Feedback>
          </div>
        )}
      </RowContent>
      <RowActions className="w-32 self-start">
        {canManage ? (
          <>
            <Select
              value={member.role}
              onValueChange={(v) => { if (v) handleRoleChange(v); }}
              disabled={isPending}
            >
              <SelectTrigger
                size="sm"
                className="w-[92px] text-type-meta"
                aria-label={`Workspace role for ${displayName}`}
              >
                <SelectValue>
                  {(value) => WORKSPACE_ROLE_LABELS[value] ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="guest">Guest</SelectItem>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`More actions for ${displayName}`}
                  />
                }
                disabled={isPending}
              >
                <MoreHorizontalIcon aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6}>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2Icon aria-hidden="true" />
                  Remove member
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <Badge variant="outline">
            {WORKSPACE_ROLE_LABELS[member.role] ?? member.role}
          </Badge>
        )}
      </RowActions>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
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
    </Row>
  );
}
