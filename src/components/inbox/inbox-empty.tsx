// #284: the Inbox's empty state and its delivery link, drawn on the server (page.tsx) and handed to the view, so
// their words and icon are never in the page's code.
import { Inbox as InboxIcon } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import buttonStyles from "@/components/arc/button/button.module.css";
import Link from "@/components/link";

/** C28: Settings → Profile's Inbox delivery section, for Admins and Members, who have it. */
export const inboxDeliveryLink = () => <Link href="/settings/profile?section=inbox-delivery" className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.sm}`}>Choose what reaches you</Link>;

/**
 * Nothing in the Inbox. C26: for someone who has Needs you, one message for both sections, with the delivery link.
 * Someone never asked to act (a Guest) keeps For your information's own empty state.
 */
export function inboxAllClear(needsYou: boolean) {
  return needsYou
    ? <EmptyState icon={<InboxIcon />} title="Nothing needs you, and nothing new" description="Reviews, Concerns and updates about your work show here." action={inboxDeliveryLink()} />
    : <EmptyState icon={<InboxIcon />} title="You’re all caught up" description="Pickups, Done, comments, Looks good and accepted invites about your work show here until you read them." />;
}
