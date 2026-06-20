"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeOnboarding } from "./actions";
import { acceptInvite } from "@/app/(auth)/invite/[token]/actions";
import { createInvite } from "@/app/(app)/settings/members/actions";
import type { PendingInvite } from "./get-pending-invites";

const ROLES = [
  { value: "pm", label: "Product Manager", helper: "Strategy and prioritisation" },
  { value: "designer", label: "Designer", helper: "Research, UI, and visual craft" },
  {
    value: "developer",
    label: "Developer",
    helper: "Engineering and implementation",
  },
] as const;

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

export function OnboardingForm({
  fullName: initialFullName,
  pendingInvites = [],
}: {
  fullName: string;
  pendingInvites?: PendingInvite[];
}) {
  const router = useRouter();

  const [showCreateForm, setShowCreateForm] = useState(
    pendingInvites.length === 0
  );
  const [acceptingToken, setAcceptingToken] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(initialFullName);
  const [role, setRole] = useState<string | null>(null);
  const [workspaceName, setWorkspaceName] = useState(
    `${initialFullName}'s Workspace`
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Post-create invite step
  const [step, setStep] = useState<"create" | "invite">("create");
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteSendError, setInviteSendError] = useState<string | null>(null);
  const [sentInviteUrl, setSentInviteUrl] = useState<string | null>(null);

  async function handleAcceptInvite(token: string) {
    setAcceptingToken(token);
    setInviteError(null);
    const result = await acceptInvite(token);
    if (result?.error) {
      setInviteError(result.error);
      setAcceptingToken(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
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
      fullName: fullName.trim(),
      workspaceName: workspaceName.trim(),
      role,
    });
    if (result?.error) {
      setError(result.error);
      setPending(false);
    } else if ("success" in result && result.orgId) {
      setCreatedOrgId(result.orgId);
      setStep("invite");
      setPending(false);
    }
  }

  async function handleSendInvite() {
    if (!createdOrgId || !inviteEmail.trim()) return;
    setInvitePending(true);
    setInviteSendError(null);
    const result = await createInvite(
      { email: inviteEmail.trim(), role: inviteRole },
      { orgId: createdOrgId }
    );
    if (result.error) {
      setInviteSendError(result.error);
      setInvitePending(false);
    } else {
      setSentInviteUrl(result.inviteUrl ?? null);
      setInvitePending(false);
    }
  }

  function handleSkipInvite() {
    router.push("/");
  }

  if (step === "invite" && createdOrgId) {
    if (sentInviteUrl) {
      return (
        <div className="space-y-6">
          <div>
            <p className="font-medium">Invite sent!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Share this link with your teammate:
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border-2 border-border bg-muted/50 p-3">
            <code className="flex-1 truncate text-sm">{sentInviteUrl}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(sentInviteUrl)}
            >
              Copy
            </Button>
          </div>
          <Button className="w-full" onClick={() => router.push("/")}>
            Continue
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div>
          <p className="font-medium">Invite a teammate</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You can always invite more people from Settings later.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inviteEmail">Email</Label>
            <Input
              id="inviteEmail"
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              disabled={invitePending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inviteRole">Role</Label>
            <select
              id="inviteRole"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              disabled={invitePending}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="guest">Guest</option>
            </select>
          </div>
        </div>

        {inviteSendError && (
          <p className="text-sm text-destructive">{inviteSendError}</p>
        )}

        <Button
          className="w-full"
          onClick={handleSendInvite}
          disabled={invitePending || !inviteEmail.trim()}
        >
          {invitePending ? "Sending..." : "Send invite"}
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleSkipInvite}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  if (!showCreateForm && pendingInvites.length > 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          {pendingInvites.map((invite) => (
            <div
              key={invite.token}
              className="flex items-center justify-between rounded-lg border-2 border-border p-4"
            >
              <div>
                <p className="font-medium">{invite.workspaceName}</p>
                <p className="text-sm text-muted-foreground">
                  as {ROLE_LABELS[invite.role] || invite.role}
                </p>
              </div>
              <Button
                size="sm"
                disabled={acceptingToken !== null}
                onClick={() => handleAcceptInvite(invite.token)}
              >
                {acceptingToken === invite.token ? "Joining..." : "Join"}
              </Button>
            </div>
          ))}
        </div>

        {inviteError && (
          <p className="text-sm text-destructive">{inviteError}</p>
        )}

        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Create your own workspace instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Full name */}
      <div className="space-y-2">
        <Label htmlFor="fullName">Your name</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jane Smith"
          disabled={pending}
        />
      </div>

      {/* Role picker */}
      <div className="space-y-2">
        <Label>What best describes your role?</Label>
        <div className="space-y-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => {
                setRole(r.value);
                setError(null);
              }}
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

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating workspace..." : "Get started"}
      </Button>

      {pendingInvites.length > 0 && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowCreateForm(false)}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Join an existing workspace instead
          </button>
        </div>
      )}
    </form>
  );
}
