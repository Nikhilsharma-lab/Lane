"use client";

import {
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeftIcon,
  ClipboardListIcon,
  Code2Icon,
  CopyIcon,
  InfoIcon,
  LinkIcon,
  MailCheckIcon,
  PenToolIcon,
  PlusIcon,
  SendIcon,
} from "lucide-react";
import { AuthAction } from "@/components/auth/auth-action";
import { AuthInputField } from "@/components/auth/auth-field";
import { LaneMark } from "@/components/auth/auth-shell";
import { useRecoverableAction } from "@/components/auth/use-recoverable-action";
import { Feedback } from "@/components/ui/feedback";
import { IdentityMark } from "@/components/ui/identity-mark";
import { Label } from "@/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  Row,
  RowActions,
  RowContent,
  RowDescription,
  RowGroup,
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
import { Typography } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { completeOnboarding } from "./actions";
import { acceptInvite } from "@/app/(auth)/invite/[token]/actions";
import { createInvite } from "@/app/(app)/settings/members/actions";
import type { PendingInvite } from "./get-pending-invites";

type FunctionalRole = "pm" | "designer" | "developer";
type Stage = "profile" | "workspace" | "invite";
type WorkspaceMode = "create" | "join";

const ROLES: Array<{
  value: FunctionalRole;
  label: string;
  helper: string;
  icon: typeof ClipboardListIcon;
}> = [
  {
    value: "pm",
    label: "PM",
    helper: "Product direction and prioritisation",
    icon: ClipboardListIcon,
  },
  {
    value: "designer",
    label: "Designer",
    helper: "Research, interaction, and visual craft",
    icon: PenToolIcon,
  },
  {
    value: "developer",
    label: "Developer",
    helper: "Engineering and implementation",
    icon: Code2Icon,
  },
];

const WORKSPACE_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

const ACCESS_HELPERS: Record<string, string> = {
  member: "Members can see the shared board, pick up Requests, and comment.",
  admin: "Admins can also invite and manage workspace members.",
  guest: "Guests only see and comment on Requests they submitted.",
};

function OnboardingChrome({
  current,
  total,
  children,
  wide = false,
}: {
  current: number;
  total: number;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-background text-foreground">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6 sm:px-8">
        <LaneMark />
        <div
          className="flex items-center gap-3"
          aria-label={`Step ${current} of ${total}`}
        >
          <span className="font-mono text-type-meta text-muted-foreground">
            {current} of {total}
          </span>
          <span className="hidden h-0.5 w-[72px] overflow-hidden bg-border sm:block">
            <span
              className="block h-full bg-brand transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${(current / total) * 100}%` }}
            />
          </span>
        </div>
      </header>
      <span className="h-0.5 w-full overflow-hidden bg-border sm:hidden">
        <span
          className="block h-full bg-brand transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${(current / total) * 100}%` }}
        />
      </span>

      <main className="flex min-h-0 flex-1 justify-center px-6 pb-10 pt-10 sm:items-center sm:px-8 sm:pb-20 sm:pt-12">
        <div className={cn("w-full", wide ? "max-w-[430px]" : "max-w-[420px]")}>
          {children}
        </div>
      </main>
    </div>
  );
}

function StepHeading({
  title,
  description,
}: {
  title: string;
  description: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Typography as="h1" role="authTitle">
        {title}
      </Typography>
      <Typography as="div" role="ui" className="max-w-[400px] text-muted-foreground text-pretty">
        {description}
      </Typography>
    </div>
  );
}

export function OnboardingForm({
  fullName: initialFullName,
  pendingInvites = [],
}: {
  fullName: string;
  pendingInvites?: PendingInvite[];
}) {
  const router = useRouter();
  const hasInvites = pendingInvites.length > 0;
  const [stage, setStage] = useState<Stage>("profile");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(
    hasInvites ? "join" : "create"
  );

  const [fullName, setFullName] = useState(initialFullName);
  const [role, setRole] = useState<FunctionalRole | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [workspaceName, setWorkspaceName] = useState(
    initialFullName ? `${initialFullName}’s workspace` : "My workspace"
  );
  const {
    pending: workspacePending,
    run: runWorkspaceAction,
  } = useRecoverableAction();
  const {
    pending: inviteAcceptPending,
    run: runInviteAcceptAction,
  } = useRecoverableAction();
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [acceptingToken, setAcceptingToken] = useState<string | null>(null);

  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const {
    pending: invitePending,
    run: runInviteAction,
  } = useRecoverableAction();
  const [isNavigating, startNavigation] = useTransition();
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sentInviteUrl, setSentInviteUrl] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState<boolean | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const totalSteps =
    workspaceMode === "join" && stage !== "invite" ? 2 : 3;
  const profileNameError = profileError?.includes("name")
    ? profileError
    : null;
  const workspaceNameError = workspaceError
    ?.toLowerCase()
    .includes("workspace name")
    ? workspaceError
    : null;
  const workspaceFormError =
    workspaceError && !workspaceNameError ? workspaceError : null;
  const inviteEmailError =
    inviteError &&
    /(email address|already a member)/i.test(inviteError)
      ? inviteError
      : null;
  const inviteFormError =
    inviteError && !inviteEmailError ? inviteError : null;

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!fullName.trim()) {
      setProfileError("Enter your name to continue.");
      return;
    }
    if (!role) {
      setProfileError("Choose a role to continue.");
      return;
    }
    setProfileError(null);
    setStage("workspace");
  }

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!role) {
      setStage("profile");
      setProfileError("Choose a role to continue.");
      return;
    }
    if (!workspaceName.trim()) {
      setWorkspaceError("Enter a workspace name to continue.");
      return;
    }

    setWorkspaceError(null);
    const outcome = await runWorkspaceAction(() =>
      completeOnboarding({
        fullName: fullName.trim(),
        workspaceName: workspaceName.trim(),
        role,
      })
    );

    if (outcome.status === "failed") {
      setWorkspaceError(
        "Lane couldn’t create the workspace. Your details are still here—check your connection and try again."
      );
      return;
    }
    if (outcome.status !== "completed") return;

    const result = outcome.value;
    if (result?.error || !result?.orgId) {
      setWorkspaceError(
        result?.error ?? "Lane could not finish creating the workspace. Try again."
      );
      return;
    }

    setCreatedOrgId(result.orgId);
    setStage("invite");
  }

  async function handleAcceptInvite(token: string) {
    if (!role) return;
    setWorkspaceError(null);
    const outcome = await runInviteAcceptAction(async () => {
      setAcceptingToken(token);
      try {
        return await acceptInvite(token, {
          fullName: fullName.trim(),
          role,
        });
      } finally {
        setAcceptingToken(null);
      }
    });
    if (outcome.status === "failed") {
      setWorkspaceError(
        "Lane couldn’t join this workspace. Check your connection and try again."
      );
      return;
    }
    if (outcome.status !== "completed") return;

    const result = outcome.value;
    if (result?.error) {
      setWorkspaceError(result.error);
    }
  }

  async function handleSendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createdOrgId || !inviteEmail.trim()) return;
    setInviteError(null);
    setInviteEmailSent(null);
    setInviteCopied(false);

    const outcome = await runInviteAction(() =>
      createInvite(
        { email: inviteEmail.trim(), role: inviteRole },
        { orgId: createdOrgId }
      )
    );
    if (outcome.status === "failed") {
      setInviteError(
        "Lane couldn’t create the invitation. Your details are still here—check your connection and try again."
      );
      return;
    }
    if (outcome.status !== "completed") return;

    const result = outcome.value;
    if (result.error) {
      setInviteError(result.error);
      return;
    }

    setSentInviteUrl(result.inviteUrl ?? null);
    setInviteEmailSent(result.emailSent === true);
  }

  async function handleCopyInvite() {
    if (!sentInviteUrl) return;
    try {
      await navigator.clipboard.writeText(sentInviteUrl);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      setInviteError("Copy failed. Select and copy the link manually.");
    }
  }

  function resetInviteForm() {
    setInviteEmail("");
    setInviteRole("member");
    setSentInviteUrl(null);
    setInviteEmailSent(null);
    setInviteCopied(false);
    setInviteError(null);
  }

  function continueToRequests() {
    startNavigation(() => {
      router.push("/");
    });
  }

  if (stage === "profile") {
    return (
      <OnboardingChrome current={1} total={totalSteps}>
        <form
          onSubmit={handleProfileSubmit}
          className="flex flex-col gap-8"
          noValidate
        >
          <StepHeading
            title="How do you work?"
            description="Choose the label that best describes you. You can change it later, and it never changes what you can access."
          />

          <div className="flex flex-col gap-5">
            <AuthInputField
              id="fullName"
              label="Your name"
              autoComplete="name"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
                setProfileError(null);
              }}
              placeholder="Jane Smith"
              error={profileNameError}
            />

            <div className="space-y-2">
              <Label id="role-label">
                Your role
              </Label>
              <RadioGroup
                className="border-t border-border"
                name="functionalRole"
                value={role}
                onValueChange={(value: FunctionalRole | null) => {
                  if (!value) return;
                  setRole(value);
                  setProfileError(null);
                }}
                required
                aria-labelledby="role-label"
                aria-describedby={profileError?.includes("role") ? "role-error" : undefined}
              >
                {ROLES.map((option) => {
                  const selected = role === option.value;
                  const Icon = option.icon;
                  return (
                    <label
                      key={option.value}
                      data-slot="radio-option"
                      className={cn(
                        "relative flex min-h-[56px] w-full cursor-pointer items-center gap-3 border-b px-2 text-left transition-colors hover:bg-muted/60 sm:min-h-[58px] sm:px-3",
                        selected && "border-brand bg-brand-soft hover:bg-brand-soft"
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          "size-[18px] shrink-0",
                          selected ? "text-brand" : "text-muted-foreground"
                        )}
                        strokeWidth={1.8}
                      />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-type-control", selected && "font-semibold")}>
                          {option.label}
                        </span>
                        <span className="block text-type-meta text-muted-foreground">
                          {option.helper}
                        </span>
                      </span>
                      <RadioGroupItem value={option.value} />
                    </label>
                  );
                })}
              </RadioGroup>
              {profileError?.includes("role") && (
                <div id="role-error">
                  <Feedback kind="error" variant="inline">
                    {profileError}
                  </Feedback>
                </div>
              )}
            </div>
          </div>

          {profileError && !profileNameError && !profileError.includes("role") && (
            <Feedback kind="error" variant="inline">
              {profileError}
            </Feedback>
          )}

          <AuthAction type="submit">
            Continue
          </AuthAction>
        </form>
      </OnboardingChrome>
    );
  }

  if (stage === "workspace" && workspaceMode === "join") {
    return (
      <OnboardingChrome current={2} total={2} wide>
        <div className="flex flex-col gap-8">
          <StepHeading
            title="You’ve been invited"
            description="Choose the workspace you want to join. Lane supports one workspace per account today."
          />

          <RowGroup>
            {pendingInvites.map((invite) => {
              const joining =
                inviteAcceptPending && acceptingToken === invite.token;
              return (
                <Row
                  key={invite.token}
                  className="min-h-[70px]"
                >
                  <RowLeading>
                    <IdentityMark
                      label={invite.workspaceName}
                      kind="workspace"
                    />
                  </RowLeading>
                  <RowContent>
                    <RowTitle className="truncate">
                      {invite.workspaceName}
                    </RowTitle>
                    <RowDescription>
                      {WORKSPACE_ROLE_LABELS[invite.role] ?? invite.role} access
                    </RowDescription>
                  </RowContent>
                  <RowActions className="w-[76px]">
                    <AuthAction
                      kind="utility"
                      disabled={inviteAcceptPending}
                      loading={joining}
                      loadingLabel="Joining…"
                      onClick={() => handleAcceptInvite(invite.token)}
                    >
                      Join
                    </AuthAction>
                  </RowActions>
                </Row>
              );
            })}
          </RowGroup>

          {workspaceError && (
            <Feedback kind="error" variant="inline">
              {workspaceError}
            </Feedback>
          )}

          <div className="flex flex-col gap-3">
            <AuthAction
              type="button"
              kind="tertiary"
              icon={PlusIcon}
              disabled={inviteAcceptPending}
              onClick={() => setWorkspaceMode("create")}
            >
              Create my own workspace instead
            </AuthAction>
            <div className="flex items-center justify-center gap-2 border-y border-border py-3 text-type-meta text-muted-foreground sm:border-0 sm:py-0">
              <InfoIcon aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.8} />
              <span>Joining leaves other invitations pending.</span>
            </div>
          </div>
        </div>
      </OnboardingChrome>
    );
  }

  if (stage === "workspace") {
    return (
      <OnboardingChrome current={2} total={3}>
        <form
          onSubmit={handleCreateWorkspace}
          className="flex flex-col gap-8"
          noValidate
          aria-busy={workspacePending}
        >
          <StepHeading
            title="Name your workspace"
            description="This is the shared home for every Request. Keep the name familiar to your team."
          />

          <AuthInputField
            id="workspaceName"
            label="Workspace name"
            autoComplete="organization"
            value={workspaceName}
            onChange={(event) => {
              setWorkspaceName(event.target.value);
              setWorkspaceError(null);
            }}
            placeholder="Studio North"
            disabled={workspacePending}
            description="You can invite teammates in the next step."
            error={workspaceNameError}
          />

          {workspaceFormError && (
            <Feedback kind="error" variant="inline">
              {workspaceFormError}
            </Feedback>
          )}

          <div className="flex flex-col gap-3">
            <AuthAction
              type="submit"
              loading={workspacePending}
              loadingLabel="Creating workspace…"
            >
              Create workspace
            </AuthAction>
            <AuthAction
              type="button"
              kind="tertiary"
              icon={ChevronLeftIcon}
              disabled={workspacePending}
              onClick={() => setStage("profile")}
            >
              Back to role
            </AuthAction>
            {hasInvites && (
              <AuthAction
                type="button"
                kind="tertiary"
                disabled={workspacePending}
                onClick={() => setWorkspaceMode("join")}
              >
                Join a workspace instead
              </AuthAction>
            )}
          </div>
        </form>
      </OnboardingChrome>
    );
  }

  if (sentInviteUrl) {
    const emailed = inviteEmailSent === true;
    return (
      <OnboardingChrome current={3} total={3}>
        <div className="flex flex-col gap-8" aria-live="polite">
          <div className="space-y-2.5">
            <div
              className={cn(
                "flex items-center gap-2 text-type-meta font-semibold tracking-[0.08em]",
                emailed ? "text-chartreuse" : "text-persimmon"
              )}
            >
              {emailed ? (
                <MailCheckIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
              ) : (
                <LinkIcon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.8} />
              )}
              <span>{emailed ? "INVITATION EMAILED" : "INVITE LINK READY"}</span>
            </div>
            <StepHeading
              title={emailed ? "Your workspace is ready" : "Share the invite link"}
              description={
                emailed
                  ? `We sent an invitation to ${inviteEmail}. They can join from the email or this link.`
                  : `The invitation for ${inviteEmail} is ready, but the email could not be sent. Share this link instead.`
              }
            />
          </div>

          <div className="flex min-w-0 items-center gap-2 border-y border-border py-3">
            <LinkIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
            <code className="min-w-0 flex-1 truncate font-mono text-type-micro">{sentInviteUrl}</code>
            <AuthAction
              type="button"
              kind="utility"
              icon={CopyIcon}
              onClick={handleCopyInvite}
            >
              {inviteCopied ? "Copied" : "Copy"}
            </AuthAction>
          </div>

          {!emailed && (
            <p className="text-type-support text-muted-foreground">
              Retry the email later from Settings → Members.
            </p>
          )}
          {inviteError && (
            <Feedback kind="error" variant="inline">
              {inviteError}
            </Feedback>
          )}

          <div className="flex flex-col gap-3">
            <AuthAction
              type="button"
              loading={isNavigating}
              loadingLabel="Opening Requests…"
              onClick={continueToRequests}
            >
              Continue to Requests
            </AuthAction>
            <AuthAction
              type="button"
              kind="tertiary"
              disabled={isNavigating}
              onClick={resetInviteForm}
            >
              Invite someone else
            </AuthAction>
          </div>
        </div>
      </OnboardingChrome>
    );
  }

  return (
    <OnboardingChrome current={3} total={3}>
      <form
        onSubmit={handleSendInvite}
        className="flex flex-col gap-8"
        noValidate
        aria-busy={invitePending || isNavigating}
      >
        <StepHeading
          title="Bring one teammate"
          description="Start the shared loop with one person. You can invite more teammates later from Settings."
        />

        <div className="flex flex-col gap-5">
          <AuthInputField
            id="inviteEmail"
            label="Work email"
            type="email"
            autoComplete="email"
            value={inviteEmail}
            onChange={(event) => {
              setInviteEmail(event.target.value);
              setInviteError(null);
            }}
            placeholder="teammate@company.com"
            disabled={invitePending}
            error={inviteEmailError}
          />

          <div className="space-y-2">
            <Label htmlFor="inviteRole">
              Workspace access
            </Label>
            <Select
              value={inviteRole}
              onValueChange={(value) => value && setInviteRole(value)}
              disabled={invitePending}
            >
              <SelectTrigger
                id="inviteRole"
                aria-describedby="invite-role-helper"
                className="h-control-form-touch w-full px-3 sm:h-control-form"
              >
                <SelectValue>
                  {(value) => WORKSPACE_ROLE_LABELS[value] ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member" label="Member">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">Member</span>
                    <span className="text-type-meta text-muted-foreground">
                      Shared Requests and comments
                    </span>
                  </span>
                </SelectItem>
                <SelectItem value="admin" label="Admin">
                  <span className="flex min-w-0 flex-col">
                    <span>Admin</span>
                    <span className="text-type-meta text-muted-foreground">
                      Can also manage members
                    </span>
                  </span>
                </SelectItem>
                <SelectItem value="guest" label="Guest">
                  <span className="flex min-w-0 flex-col">
                    <span>Guest</span>
                    <span className="text-type-meta text-muted-foreground">
                      Only Requests they submit
                    </span>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <p
              id="invite-role-helper"
              className="text-type-support text-muted-foreground"
            >
              {ACCESS_HELPERS[inviteRole]}
            </p>
          </div>
        </div>

        {inviteFormError && (
          <Feedback kind="error" variant="inline">
            {inviteFormError}
          </Feedback>
        )}

        <div className="flex flex-col gap-3">
          <AuthAction
            type="submit"
            disabled={invitePending || isNavigating || !inviteEmail.trim()}
            loading={invitePending}
            loadingLabel="Sending invite…"
            icon={SendIcon}
          >
            Send invite
          </AuthAction>
          <AuthAction
            type="button"
            kind="tertiary"
            disabled={invitePending || isNavigating}
            loading={isNavigating}
            loadingLabel="Opening Requests…"
            onClick={continueToRequests}
          >
            Skip for now
          </AuthAction>
        </div>
      </form>
    </OnboardingChrome>
  );
}
