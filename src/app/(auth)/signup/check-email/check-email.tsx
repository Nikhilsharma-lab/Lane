"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MailCheckIcon } from "lucide-react";
import { resendSignupConfirmation } from "../../actions";
import { AuthAction } from "@/components/auth/auth-action";
import { useRecoverableAction } from "@/components/ui/use-recoverable-action";
import { AuthHeading, AuthKicker } from "@/components/auth/auth-shell";
import { Feedback, type FeedbackKind } from "@/components/ui/feedback";

const RESEND_COOLDOWN_SECONDS = 60;

export function CheckEmail({ email, next }: { email: string; next: string }) {
  const [remaining, setRemaining] = useState(RESEND_COOLDOWN_SECONDS);
  const [feedback, setFeedback] = useState<{
    kind: Extract<FeedbackKind, "success" | "error">;
    title: string;
    message: string;
  } | null>(null);
  const { pending, run } = useRecoverableAction();

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  async function handleResend() {
    if (!email || remaining > 0) return;
    setFeedback(null);

    const outcome = await run(() =>
      resendSignupConfirmation(email, next)
    );
    if (outcome.status === "failed") {
      setFeedback({
        kind: "error",
        title: "Couldn’t resend",
        message: "Check your connection and try again.",
      });
      return;
    }
    if (outcome.status !== "completed") return;

    if (outcome.value.error) {
      setFeedback({
        kind: "error",
        title: "Couldn’t resend",
        message: "Try again in a minute.",
      });
      return;
    }

    setRemaining(RESEND_COOLDOWN_SECONDS);
    setFeedback({
      kind: "success",
      title: "Email sent again",
      message: "A new confirmation link is on its way.",
    });
  }

  const loginParams = new URLSearchParams();
  if (next !== "/") loginParams.set("next", next);
  if (email) loginParams.set("email", email);
  const loginHref = loginParams.size ? `/login?${loginParams}` : "/login";

  return (
    <div className="space-y-8">
      <AuthHeading
        title="Check your email"
        kicker={
          <AuthKicker icon={MailCheckIcon}>EMAIL CONFIRMATION</AuthKicker>
        }
        description={
          <>
            We sent a confirmation link
            {email ? (
              <>
                {" "}to <strong className="font-semibold text-foreground">{email}</strong>
              </>
            ) : null}
            . Open it to finish creating your account.
          </>
        }
      />

      <Feedback
        kind={feedback?.kind ?? "success"}
        title={feedback?.title ?? "Email sent"}
      >
        {feedback?.message ??
          "It may take a minute. Check spam if it does not arrive."}
      </Feedback>

      <div className="space-y-3">
        {email && (
          <AuthAction
            type="button"
            kind="secondary"
            onClick={handleResend}
            disabled={pending || remaining > 0}
            loading={pending}
            loadingLabel="Sending…"
          >
            {remaining > 0
              ? `Resend in ${remaining}s`
              : "Resend confirmation email"}
          </AuthAction>
        )}

        <AuthAction
          nativeButton={false}
          render={<Link href={loginHref} />}
          kind="tertiary"
        >
          Back to sign in
        </AuthAction>
      </div>
    </div>
  );
}
