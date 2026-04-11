import Link from "next/link";
import { notFound } from "next/navigation";
import { InviteSignupForm } from "@/components/team/invite-signup-form";
import { getInviteContext } from "@/lib/bootstrap-access";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await getInviteContext(token);
  if (!invite) notFound();

  const isExpired = new Date() > invite.expiresAt;
  const isAccepted = !!invite.acceptedAt;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardDescription className="uppercase tracking-wide">
            You&apos;re invited
          </CardDescription>
          <CardTitle className="text-xl">{invite.orgName}</CardTitle>
          {invite.invitedByName && (
            <CardDescription>
              {invite.invitedByName} invited you as{" "}
              <span className="capitalize text-foreground">{invite.role}</span>
            </CardDescription>
          )}
        </CardHeader>

        <CardContent>
          {isAccepted ? (
            <Alert>
              <AlertTitle>Invite already used</AlertTitle>
              <AlertDescription>
                This invite has already been accepted.
              </AlertDescription>
            </Alert>
          ) : isExpired ? (
            <Alert>
              <AlertTitle>Invite expired</AlertTitle>
              <AlertDescription>
                This invite has expired. Ask your team lead to send a new one.
              </AlertDescription>
            </Alert>
          ) : (
            <InviteSignupForm
              token={token}
              defaultEmail={invite.email}
              orgName={invite.orgName}
            />
          )}
        </CardContent>

        {(isAccepted || isExpired) && (
          <CardFooter className="justify-center">
            <Button variant="link" size="sm" render={<Link href="/login" />}>
              Sign in instead
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
