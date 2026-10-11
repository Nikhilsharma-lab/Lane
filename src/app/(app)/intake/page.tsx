import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { IntakeLauncher } from "@/components/requests/intake-launcher";

export default async function IntakePage() {
  const result = await getWorkspace();

  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

  return <IntakeLauncher />;
}
