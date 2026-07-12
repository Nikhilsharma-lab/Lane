"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signup } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SignupForm({
  next,
  initialEmail,
  emailLocked,
}: {
  next: string;
  initialEmail: string;
  emailLocked: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const loginParams = new URLSearchParams();
  if (next !== "/") loginParams.set("next", next);
  if (initialEmail) loginParams.set("email", initialEmail);
  const loginHref = loginParams.size ? `/login?${loginParams}` : "/login";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const result = await signup(new FormData(event.currentTarget), next);
    if (result?.error) {
      setError(result.error);
      setPending(false);
      return;
    }
    if (result?.confirmationRequired) {
      const params = new URLSearchParams({
        email: result.email,
        next: result.next,
      });
      router.push(`/signup/check-email?${params}`);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-semibold tracking-tight">
          Lane
        </CardTitle>
        <CardDescription>
          {emailLocked ? "Accept your workspace invite" : "Create your account"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="Jane Smith"
              required
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              defaultValue={initialEmail}
              readOnly={emailLocked}
              required
              autoComplete="email"
              aria-describedby={emailLocked ? "invite-email-help" : undefined}
            />
            {emailLocked && (
              <p id="invite-email-help" className="text-sm text-muted-foreground">
                This invite is tied to this email address.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="At least 6 characters"
              required
              autoComplete="new-password"
              minLength={6}
            />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={loginHref}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
