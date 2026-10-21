import { redirect } from "next/navigation";

import { getWorkspace } from "@/lib/ensure-workspace";
import { OnboardingSignOut } from "@/components/auth/onboarding-sign-out";
import { RoleForm } from "./role-form";

export default async function OnboardingPage() {
  const result = await getWorkspace();

  if (!result) redirect("/login");
  if (!result.needsOnboarding) redirect("/");

  return <RoleForm headerAction={<OnboardingSignOut />} />;
}
