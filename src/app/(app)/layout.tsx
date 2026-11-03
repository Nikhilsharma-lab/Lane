import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getMember } from "@/lib/ensure-workspace";
import { loadWorkspaceFrame } from "@/lib/data/workspace-frame";
import { WorkspaceFrame } from "@/components/shell/workspace-frame";
import { followSeatChangesAfterResponse } from "@/lib/billing";

// The AI gate in the New Request composer waits up to 15 s (src/lib/ai/triage.ts),
// and the composer opens from every page under this layout, so the function
// limit for the whole segment sits above it (plan item 1.1).
export const maxDuration = 30;

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Identity and permission come from Clerk claims, so the reads below can
  // start before any database round trip (plan item 1.8).
  const member = await getMember();
  if (!member) return (await auth()).redirectToSignIn();

  const workspace = await loadWorkspaceFrame(member);
  if (!workspace) return (await auth()).redirectToSignIn();
  if (workspace.needsOnboarding) redirect("/onboarding");
  // #215: a paying workspace's seats follow Clerk memberships; checked after the response, at most every 10 minutes.
  followSeatChangesAfterResponse({ orgId: workspace.orgId });

  // #271: the sidebar and the shared providers live in WorkspaceFrame, which "Page not found" also draws.
  return <WorkspaceFrame {...workspace.frame}>{children}</WorkspaceFrame>;
}
