import Link from "next/link"
import { LoaderCircleIcon } from "lucide-react"

import { AuthAction } from "@/components/auth/auth-action"
import {
  AuthHeading,
  AuthShell,
} from "@/components/auth/auth-shell"

export default function InviteLoading() {
  return (
    <AuthShell>
      <div className="space-y-8">
        <AuthHeading
          title="Checking your invitation"
          description="Confirming the workspace and invited email."
          kicker={
            <span className="text-type-meta font-semibold tracking-[0.08em] text-muted-foreground">
              CHECKING INVITE
            </span>
          }
        />

        <div className="space-y-3 border-y border-border py-4">
          <p className="text-type-meta font-medium text-muted-foreground">
            Workspace
          </p>
          <div
            aria-hidden="true"
            className="h-5 w-44 animate-pulse rounded bg-muted motion-reduce:animate-none"
          />
          <p className="text-type-support text-muted-foreground">
            This usually takes a moment. Keep this page open.
          </p>
        </div>

        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="flex min-h-control-form-touch items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-type-control sm:min-h-control-form"
        >
          <LoaderCircleIcon
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
            strokeWidth={1.8}
          />
          <span>Checking invitation…</span>
        </div>

        <AuthAction
          nativeButton={false}
          render={<Link href="/login" />}
          kind="tertiary"
        >
          Back to sign in
        </AuthAction>
      </div>
    </AuthShell>
  )
}
