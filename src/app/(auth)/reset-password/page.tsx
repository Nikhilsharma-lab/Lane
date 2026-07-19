import Link from "next/link";
import { Link2OffIcon } from "lucide-react";
import { AuthAction } from "@/components/auth/auth-action";
import {
  AuthHeading,
  AuthHeaderLink,
  AuthKicker,
  AuthShell,
} from "@/components/auth/auth-shell";
import { Feedback } from "@/components/ui/feedback";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const invalid = params.error === "invalid-link" || !user;

  return (
    <AuthShell
      headerAction={
        <AuthHeaderLink
          prompt="Need another link?"
          href="/forgot-password"
          label="Request one"
        />
      }
    >
      {invalid ? (
        <div className="space-y-8">
          <AuthHeading
            title="This reset link has expired"
            description="For your security, reset links are temporary and can be used only once."
            kicker={<AuthKicker icon={Link2OffIcon}>RESET LINK</AuthKicker>}
          />
          <Feedback kind="info">
            Request a fresh link. If the first email arrives later, use only
            the newest message.
          </Feedback>
          <div className="space-y-3">
            <AuthAction
              nativeButton={false}
              render={<Link href="/forgot-password" />}
            >
              Request a new link
            </AuthAction>
            <AuthAction
              nativeButton={false}
              render={<Link href="/login" />}
              kind="tertiary"
            >
              Back to sign in
            </AuthAction>
          </div>
        </div>
      ) : (
        <ResetPasswordForm />
      )}
    </AuthShell>
  );
}
