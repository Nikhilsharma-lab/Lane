import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import IntakeForm from "./intake-form";

export default async function IntakePage() {
  const result = await getWorkspace();

  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

  return (
    <IntakeForm
      context={{ userId: result.userId, orgId: result.orgId }}
    />
  );
}
