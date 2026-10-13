import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { IntakeLauncher } from "@/components/requests/intake-launcher";
import { PageStrip } from "@/components/shell/page-strip";

export default async function IntakePage() {
  const result = await getWorkspace();

  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

  // Every page owns one 44px strip (plan item 2.0); the crumb names the page "New Request" (decision 8.10).
  return (
    <>
      <PageStrip title="New Request" />
      <IntakeLauncher />
    </>
  );
}
