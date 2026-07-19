import {
  AuthHeaderLink,
  AuthShell,
} from "@/components/auth/auth-shell";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { RecoveryForm } from "./recovery-form";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  const loginParams = new URLSearchParams();
  if (params.email) loginParams.set("email", params.email);
  if (next !== "/") loginParams.set("next", next);
  const loginHref = loginParams.size ? `/login?${loginParams}` : "/login";

  return (
    <AuthShell
      headerAction={
        <AuthHeaderLink
          prompt="Remembered it?"
          href={loginHref}
          label="Sign in"
        />
      }
    >
      <RecoveryForm
        initialEmail={params.email ?? ""}
        next={next}
      />
    </AuthShell>
  );
}
