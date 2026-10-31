import { redirect } from "next/navigation";
import { InboxScreen } from "@/components/inbox/inbox-screen";
import { toInboxItem, toNeedsYouItem } from "@/components/inbox/inbox-item";
import { getMember, getWorkspace } from "@/lib/ensure-workspace";
import { loadInbox } from "@/lib/data/inbox";
import { getsNeedsYou } from "@/lib/inbox-read-model";
import { countInboxUnread } from "@/lib/data/notifications";
import { timePage, timed } from "@/lib/request-timings";

// #204 / #205: the Inbox, one page of what needs a person and their updates. Identity, workspace and role come from the Clerk session
// through getMember; the read model decides what the Inbox holds (a Guest sees only their own submissions).
export default async function InboxPage() {
  void timePage("Inbox");
  const member = await getMember();
  if (!member) redirect("/login");

  const [inbox, unread, workspace] = await Promise.all([timed("data", () => loadInbox(member)), timed("data", () => countInboxUnread(member)), getWorkspace()]);
  const name = workspace && !workspace.needsOnboarding ? workspace.fullName : "";
  const items = inbox.forYourInformation.map(toInboxItem);

  return <InboxScreen
    orgId={member.orgId}
    initialNeedsYou={inbox.needsYou.map(toNeedsYouItem)}
    showNeedsYou={getsNeedsYou(member)}
    initialItems={items}
    initialUnread={Math.max(unread, items.length)}
    isGuest={member.role === "guest"}
    viewer={{ id: member.userId, name, isAdmin: member.role === "admin", readOnly: member.role === "viewer" }}
  />;
}
