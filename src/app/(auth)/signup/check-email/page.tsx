import { CheckEmail } from "./check-email";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { z } from "zod";
import {
  AuthHeaderLink,
  AuthShell,
} from "@/components/auth/auth-shell";

const emailSchema = z.string().email().max(254);

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const params = await searchParams;
  const parsedEmail = emailSchema.safeParse(params.email);
  const next = safeRedirectPath(params.next);
  const loginParams = new URLSearchParams();
  if (parsedEmail.success) loginParams.set("email", parsedEmail.data);
  if (next !== "/") loginParams.set("next", next);
  const loginHref = loginParams.size ? `/login?${loginParams}` : "/login";

  return (
    <AuthShell
      headerAction={
        <AuthHeaderLink
          prompt="Already confirmed?"
          href={loginHref}
          label="Sign in"
        />
      }
    >
      <CheckEmail
        email={parsedEmail.success ? parsedEmail.data : ""}
        next={next}
      />
    </AuthShell>
  );
}
