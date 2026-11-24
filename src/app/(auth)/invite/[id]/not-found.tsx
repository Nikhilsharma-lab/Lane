import type { Metadata } from "next";

import { MissingPageNoWorkspace } from "@/app/missing-page";
import { getSession } from "@/lib/ensure-workspace";

export const metadata: Metadata = { title: "Page not found" };

// #392: a link no invitation answers. The root's not-found boundary reads nothing, so it would ask someone signed in
// to sign in. Next draws this with every invitation page; the session it reads is the page's own, cached per request.
export default async function InvitationNotFound() {
  return <MissingPageNoWorkspace signedIn={Boolean(await getSession())} />;
}
