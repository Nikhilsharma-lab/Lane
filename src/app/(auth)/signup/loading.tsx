import {
  AuthHeaderLink,
  AuthShell,
} from "@/components/auth/auth-shell"
import { LoadingRegion } from "@/components/ui/loading-region"

function FieldSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-[18px] w-24 rounded bg-muted" />
      <div className="h-control-form-touch rounded-lg border border-border bg-card sm:h-control-form" />
    </div>
  )
}

export default function SignupLoading() {
  return (
    <AuthShell
      headerAction={
        <AuthHeaderLink
          prompt="Already have an account?"
          href="/login"
          label="Sign in"
        />
      }
    >
      <LoadingRegion
        label="Loading account creation"
        className="space-y-8"
      >
        <div className="space-y-2">
          <div className="h-9 w-56 rounded-md bg-muted" />
          <div className="h-5 w-full max-w-[340px] rounded bg-muted" />
        </div>

        <div className="space-y-4">
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
          <div className="h-control-form-touch rounded-lg bg-muted sm:h-control-form" />
        </div>

        <div className="h-[18px] w-64 max-w-full rounded bg-muted" />
      </LoadingRegion>
    </AuthShell>
  )
}
