import { redirect } from "next/navigation";

import { getWorkspace } from "@/lib/ensure-workspace";
import { RoleForm } from "./role-form";

export default async function OnboardingPage() {
  const result = await getWorkspace();

  if (!result) redirect("/login");
  if (!result.needsOnboarding) redirect("/");

  return <RoleForm />;
}
