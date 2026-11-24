import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMember, getWorkspace, sendAwayMemberless } from "@/lib/ensure-workspace";
import { canCreateRequests } from "@/lib/role-rules";
import { IntakeLauncher } from "@/components/requests/intake-launcher";
import { PageStrip } from "@/components/shell/page-strip";
import { firstRunSlot } from "@/components/first-run/first-run-slot";
import { timePage, timed } from "@/lib/request-timings";

// #271 (A114): the tab reads "New Request · Lane".
export const metadata: Metadata = { title: "New Request" };

export default async function IntakePage() {
  void timePage("Intake");
  const result = await getWorkspace();

  if (!result) return sendAwayMemberless();
  if (result.needsOnboarding) redirect("/onboarding");
  // #210: a Viewer reads everything and files nothing. #285: the shared "can create Requests" rule decides.
  if (!canCreateRequests(result.role)) redirect("/");
  // #217: the first Request guide also explains the steps here, beside the launcher, which files the Request.
  const member = await getMember();
  const firstRun = member ? await timed("data", () => firstRunSlot(member, result.workspaceName, "intake")) : null;

  // Every page owns one 44px strip (plan item 2.0). The strip is the page's h1 and
  // names it "New Request" (decision 8.10); the composer opens over it as a
  // centred dialog (2026-10-13), so the launcher has no heading of its own.
  return (
    <>
      <PageStrip title="New Request" heading />
      <IntakeLauncher guide={firstRun?.node} />
    </>
  );
}
