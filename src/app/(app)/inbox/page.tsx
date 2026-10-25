import { redirect } from "next/navigation";
import { InboxScreen } from "@/components/inbox/inbox-screen";
import { toInboxItem } from "@/components/inbox/inbox-item";
import { getMember, getWorkspace } from "@/lib/ensure-workspace";
import { loadInbox } from "@/lib/data/inbox";
import { countInboxUnread } from "@/lib/data/notifications";

// #204: the Inbox, one page of a person's updates. Identity, workspace and role come from the Clerk session
// through getMember; the read model decides what the Inbox holds (a Guest sees only their own submissions).
export default async function InboxPage() {
  const member = await getMember();
  if (!member) redirect("/login");

  const [inbox, unread, workspace] = await Promise.all([loadInbox(member), countInboxUnread(member), getWorkspace()]);
  const name = workspace && !workspace.needsOnboarding ? workspace.fullName : "";
  const items = inbox.forYourInformation.map(toInboxItem);

  return <InboxScreen
    orgId={member.orgId}
    initialItems={items}
    initialUnread={Math.max(unread, items.length)}
    isGuest={member.role === "guest"}
    viewer={{ id: member.userId, name, isAdmin: member.role === "admin" }}
  />;
}
