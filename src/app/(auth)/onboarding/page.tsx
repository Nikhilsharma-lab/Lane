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
    <OnboardingForm
      fullName={result.fullName}
      pendingInvites={pendingInvites}
    />
  );
}
