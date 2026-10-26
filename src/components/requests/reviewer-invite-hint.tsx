import Link from "next/link";
import styles from "./reviewer-invite-hint.module.css";

/**
 * #211: Reviewers are always on a paid seat. Wherever someone picks Reviewers,
 * this says so and what to do about anyone missing: a Member asks an admin to
 * invite them; an Admin is pointed to Members settings, as a link where the
 * keyboard can reach one (`linked`), otherwise in words.
 */
export function ReviewerInviteHint({ canInvite, linked = true, className }: { canInvite: boolean; linked?: boolean; className?: string }) {
  return <p className={className}>
    Only Admins and Members can review. Not listed?{" "}
    {!canInvite
      ? "Ask an admin to invite them."
      : linked
        ? <><Link href="/settings/members" className={styles.link}>Invite them as a Member</Link>.</>
        : "Invite them as a Member in Settings, Members."}
  </p>;
}
