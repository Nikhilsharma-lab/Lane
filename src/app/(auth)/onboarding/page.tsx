import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getWorkspace } from "@/lib/ensure-workspace";
import { timePage } from "@/lib/request-timings";
import { OnboardingSignOut } from "@/components/auth/onboarding-sign-out";
import { RoleForm } from "./role-form";

// #271 (A114): the tab reads "Choose your role · Lane".
export const metadata: Metadata = { title: "Choose your role" };

export default async function OnboardingPage() {
  void timePage("Onboarding");
  const result = await getWorkspace();

  if (!result) redirect("/login");
  if (!result.needsOnboarding) redirect("/");

  return <RoleForm headerAction={<OnboardingSignOut />} />;
}
