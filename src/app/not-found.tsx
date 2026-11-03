import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { LazyMissingInFrame } from "@/components/shell/lazy-missing-in-frame";
import { getMember } from "@/lib/ensure-workspace";
import { loadWorkspaceFrame } from "@/lib/data/workspace-frame";
import { MissingPageSignedOut } from "./missing-page";

export const metadata: Metadata = { title: "Page not found" };

/** The signed-in frame's data, or null for anyone without a workspace to show. */
async function signedInFrame() {
  try {
    const member = await getMember();
    if (!member) return null;
    const workspace = await loadWorkspaceFrame(member);
    return workspace && !workspace.needsOnboarding ? workspace.frame : null;
  } catch (error) {
    unstable_rethrow(error);
    // An address the proxy skips (one ending in a file extension) has no Clerk session to read, and a failed read
    // must not turn a 404 into an error screen: either way the visitor gets the signed-out version.
    return null;
  }
}

// Root not-found (plan item 1.12): every address no page answers, and an unknown Request (requests/[id]/layout.tsx),
// with status 404. #271 (A117, A118, A119): signed in with a workspace, it keeps the app frame and the sidebar;
// anyone else sees the Lane mark and Sign in.
export default async function NotFound() {
  const signedIn = await signedInFrame();
  return signedIn
    ? <LazyMissingInFrame {...signedIn} />
    : <MissingPageSignedOut />;
}
