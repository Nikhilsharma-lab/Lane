import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { loadInvitation } from "@/lib/data/invitations";
import { getSession } from "@/lib/ensure-workspace";
import { InvitationScreen } from "./invitation-screen";

type Props = { params: Promise<{ id: string }> };

/** The invitation as the visitor may see it, read once per request for the tab and the page. */
const openInvitation = cache(async function openInvitation(id: string) {
  const session = await getSession();
  return (await loadInvitation(id, session?.userId ?? null)) ?? notFound();
});

// Proposed for Nikhil: the tab's name, whatever the invitation's state.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { invitation } = await openInvitation((await params).id);
  return { title: `Join ${invitation.workspace}` };
}

/** #392 (spec #383 "/invite/[id]"): an emailed invitation, opened signed in or out. Opening it changes nothing. */
export default async function InvitationPage({ params }: Props) {
  return <InvitationScreen {...(await openInvitation((await params).id))} />;
}
