import "server-only";

import { and, eq } from "drizzle-orm";

import { db, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { ReviewRuleError, type ReviewPerson } from "@/lib/request-review";
import { getRequestReviewMembers, type ReviewMember } from "@/lib/request-review-members";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const REVIEWER_QUERY_MAX = 100;

function person(member: ReviewMember): ReviewPerson { return { id: member.id, name: member.name }; }

/**
 * Plan item 1.16: the reviewer type-ahead, with the same checks as
 * listDesignReviewers in src/app/(app)/requests/[id]/review-actions.ts. The
 * caller has already passed requireMemberOrAbove (guests never ask for a
 * review). Throws ReviewRuleError for a Request outside the workspace or a
 * caller whose membership Clerk no longer confirms; other errors propagate.
 */
export async function loadDesignReviewers(auth: MemberAuth, requestId: string, query: string): Promise<ReviewPerson[]> {
  if (!UUID_RE.test(requestId)) throw new ReviewRuleError("Request not found");
  const [request] = await db.select({ id: requests.id }).from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId))).limit(1);
  if (!request) throw new ReviewRuleError("Request not found");
  // Verify the caller independently because the search query may exclude them.
  const self = await getRequestReviewMembers(auth.orgId, { userIds: [auth.userId] });
  if (!self.some(member => member.id === auth.userId)) throw new ReviewRuleError("Your workspace membership could not be confirmed. Refresh and try again.");
  const members = await getRequestReviewMembers(auth.orgId, { query });
  return members.filter(member => member.id !== auth.userId).map(person);
}
