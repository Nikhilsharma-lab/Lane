import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { unstable_rethrow } from "next/navigation";
import { LazyMissingInFrame } from "@/components/shell/lazy-missing-in-frame";
import { getMember } from "@/lib/ensure-workspace";
import { loadWorkspaceFrame } from "@/lib/data/workspace-frame";
import { MissingPageNoWorkspace } from "./missing-page";

export const metadata: Metadata = { title: "Page not found" };

/** The signed-in frame's data; "signed-in" for someone with no workspace to show yet; null for anyone signed out. */
async function visitor() {
  try {
    const member = await getMember();
    if (member) {
      const workspace = await loadWorkspaceFrame(member);
      if (workspace && !workspace.needsOnboarding) return workspace.frame;
    }
    // A session waiting on Clerk's choose-a-workspace step counts as signed in here.
    return member || (await auth({ treatPendingAsSignedOut: false })).userId ? "signed-in" : null;
  } catch (error) {
    unstable_rethrow(error);
    // An address the proxy skips (one ending in a file extension) has no Clerk session to read, and a failed read
    // must not turn a 404 into an error screen: either way the visitor gets the signed-out version.
    return null;
  }
}

// Root not-found (plan item 1.12): every address no page answers, with status 404. #271 (A118, A119): signed in
// with a workspace, it keeps the app frame and the sidebar; anyone else sees the Lane mark, with Sign in, or Go to
// Lane for someone signed in who hasn't a workspace yet. A 404 thrown under the (app) layout (an unknown Request or
// Metric, A117) has its own not-found inside that layout's frame (requests/not-found.tsx, settings/metrics/not-found.tsx).
//
// Fix round 3: Next also draws this file with every page, shown or not, as the root's not-found boundary. Its reads
// then ran on every page (the frame twice, and with the database refusing connections they kept the root error
// screen's tab loading for up to two minutes), and its session check made /login, /privacy and /terms dynamic.
// As the boundary Next passes it no props, so there it reads nothing; only the page for an address no route answers
// (Next's /_not-found, which gets `params`) reads who is visiting. No page outside (app) throws a 404 today.
export default async function NotFound(props: { params?: Promise<unknown> }) {
  if (!("params" in props)) return <MissingPageNoWorkspace signedIn={false} />;
  const shown = await visitor();
  return shown && shown !== "signed-in"
    ? <LazyMissingInFrame {...shown} />
    : <MissingPageNoWorkspace signedIn={shown === "signed-in"} />;
}
