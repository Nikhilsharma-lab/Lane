"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { resendSignupConfirmation } from "../../actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const RESEND_COOLDOWN_SECONDS = 60;

export function CheckEmail({ email, next }: { email: string; next: string }) {
  const [remaining, setRemaining] = useState(RESEND_COOLDOWN_SECONDS);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [remaining]);

  function handleResend() {
    if (!email || remaining > 0) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await resendSignupConfirmation(email, next);
      if (result.error) {
        setFeedback({ kind: "error", message: result.error });
        return;
      }
      setRemaining(RESEND_COOLDOWN_SECONDS);
      setFeedback({
        kind: "success",
        message: "A new confirmation email is on its way.",
      });
    });
  }

  const loginParams = new URLSearchParams();
  if (next !== "/") loginParams.set("next", next);
  if (email) loginParams.set("email", email);
  const loginHref = loginParams.size ? `/login?${loginParams}` : "/login";

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mx-auto mb-1 flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Mail className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Check your email
        </CardTitle>
        <CardDescription className="max-w-[32ch] break-words text-pretty">
          We sent a confirmation link{email ? ` to ${email}` : ""}. Open it to finish creating your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          It may take a minute. Check your spam folder if it does not arrive.
        </p>

        {email && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleResend}
            disabled={isPending || remaining > 0}
          >
            {isPending
              ? "Sending…"
              : remaining > 0
                ? `Resend in ${remaining}s`
                : "Resend confirmation email"}
          </Button>
        )}

        {feedback && (
          <p
            role={feedback.kind === "error" ? "alert" : "status"}
            className={
              feedback.kind === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {feedback.message}
          </p>
        )}

        <Link
          href={loginHref}
          className="inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          Back to sign in
        </Link>
      </CardContent>
    </Card>
  );
}
