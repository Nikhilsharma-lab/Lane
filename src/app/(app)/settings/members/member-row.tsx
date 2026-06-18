"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { updateMemberRole, removeMember } from "./actions";

const ROLE_LEVEL: Record<string, number> = { owner: 30, admin: 20, member: 10 };

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
    role: "owner" | "admin" | "member";
  };
  context: { userId: string; orgId: string };
  callerRole: "owner" | "admin" | "member";
  isCurrentUser: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
          <>
            <select
              value={member.role}
              onChange={(e) => handleRoleChange(e.target.value)}
              disabled={isPending}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs capitalize"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={handleRemove}
              disabled={isPending}
              className="rounded px-2 py-1 text-xs text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
            >
              Remove
            </button>
          </>
        ) : (
          <Badge variant="secondary" className="capitalize">
            {member.role}
          </Badge>
        )}
      </div>
    </div>
  );
}
