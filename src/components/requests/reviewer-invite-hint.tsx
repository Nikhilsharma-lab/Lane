import Link from "next/link";

/**
 * #211: Reviewers are always on a paid seat. Wherever someone picks Reviewers,
 * this says so and what to do about anyone missing: a Member asks an admin to
 * invite them; an Admin goes to Members settings.
 */
export function ReviewerInviteHint({ canInvite, className }: { canInvite: boolean; className?: string }) {
  return <p className={className}>
    Only Admins and Members can review. Not listed?{" "}
    {canInvite ? <><Link href="/settings/members">Invite them as a Member</Link>.</> : "Ask an admin to invite them."}
  </p>;
}
