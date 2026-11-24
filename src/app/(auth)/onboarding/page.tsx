import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSession, getWorkspace } from "@/lib/ensure-workspace";
import { sendToSignIn } from "@/lib/session";
import { timePage } from "@/lib/request-timings";
import { OnboardingSignOut } from "@/components/auth/onboarding-sign-out";
import { RoleForm } from "./role-form";

// #271 (A114): the tab reads "Choose your role · Lane".
export const metadata: Metadata = { title: "Choose your role" };

export default async function OnboardingPage() {
  void timePage("Onboarding");
  const result = await getWorkspace();

  if (!result && !(await getSession())) return sendToSignIn();
  // Signed in with no workspace sees the role step too, so nothing that sends them here loops.
  if (result && !result.needsOnboarding) redirect("/");

  return <RoleForm headerAction={<OnboardingSignOut />} />;
}
