import { getValidSignupInvite } from "@/lib/signup-invite";
import { safeRedirectPath } from "@/lib/safe-redirect";
import {
  AuthHeaderLink,
  AuthShell,
  AuthTrust,
} from "@/components/auth/auth-shell";
import { ShieldCheckIcon } from "lucide-react";
import { SignupForm } from "./signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  const invite = await getValidSignupInvite(next);
  const loginParams = new URLSearchParams();
  if (next !== "/") loginParams.set("next", next);
  if (invite?.email ?? params.email) {
    loginParams.set("email", invite?.email ?? params.email ?? "");
  }
  const loginHref = loginParams.size ? `/login?${loginParams}` : "/login";

  return (
    <AuthShell
      headerAction={
        <AuthHeaderLink
          prompt="Already have an account?"
          href={loginHref}
          label="Sign in"
        />
      }
      footer={
        !invite ? (
          <AuthTrust icon={ShieldCheckIcon} className="justify-center sm:justify-start">
            No trial pressure. No people analytics.
          </AuthTrust>
        ) : undefined
      }
    >
      <SignupForm
        next={next}
        initialEmail={invite?.email ?? params.email ?? ""}
        emailLocked={Boolean(invite)}
        workspaceName={invite?.workspaceName}
      />
    </AuthShell>
  );
}
