import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { IntakeLauncher } from "@/components/requests/intake-launcher";
import { PageStrip } from "@/components/shell/page-strip";

export default async function IntakePage() {
  const result = await getWorkspace();

  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

  // Every page owns one 44px strip (plan item 2.0). The strip is the page's h1 and
  // names it "New Request" (decision 8.10); the composer opens over it as a
  // centred dialog (2026-10-13), so the launcher has no heading of its own.
  return (
    <>
      <PageStrip title="New Request" heading />
      <IntakeLauncher />
    </>
  );
}
