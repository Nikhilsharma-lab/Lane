import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { OnboardingForm } from "./onboarding-form";
import { getPendingInvites } from "./get-pending-invites";

export default async function OnboardingPage() {
  const result = await getWorkspace();

  if (!result) redirect("/login");
  if (!result.needsOnboarding) redirect("/");

  const pendingInvites = await getPendingInvites(result.email);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to Lane
          </h1>
          <p className="mt-1 text-muted-foreground">
            {pendingInvites.length > 0
              ? "You've been invited to a workspace."
              : "Set up your workspace to get started."}
          </p>
        </div>
        <OnboardingForm
          fullName={result.fullName}
          pendingInvites={pendingInvites}
        />
      </div>
    </div>
  );
}
