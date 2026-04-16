/**
 * getActiveNavItem — determines which sidebar item to highlight.
 *
 * Rules from nav-spec section 6:
 * - A request's canonical location is always {team} → Active requests
 * - Prove/cross-team views highlight on the list;
 *   click into a request → highlight moves to team's Active requests
 * - Inbox stays highlighted during triage flow
 * - Cross-team view stays visible (not highlighted) when viewing a request from it
 */

export type NavItemKey =
  | "inbox"
  | "my_streams"
  | "drafts"
  | "saved"
  | "idea_board"
  | "cross_team_view"
  | "report"
  // Team-scoped items: "team:{teamSlug}:{item}"
  | `team:${string}:active_requests`
  | `team:${string}:intake_queue`
  | `team:${string}:commitments`
  | `team:${string}:prove`
  | `team:${string}:archive`;

export interface StreamContext {
  teamSlug: string;
}

export function getActiveNavItem(
  pathname: string,
  streamContext?: StreamContext,
): NavItemKey {
  // ── Personal zone ─────────────────────────────────────────────────────────
  if (pathname === "/dashboard/inbox" || pathname.startsWith("/dashboard/inbox/")) {
    return "inbox";
  }
  if (pathname === "/dashboard/my-requests" || pathname === "/dashboard/my-requests/") {
    return "my_streams";
  }
  if (pathname.startsWith("/dashboard/drafts")) {
    return "drafts";
  }
  if (pathname.startsWith("/dashboard/saved")) {
    return "saved";
  }
  if (pathname.startsWith("/dashboard/ideas")) {
    return "idea_board";
  }
  if (pathname.startsWith("/dashboard/report")) {
    return "report";
  }

  // ── Cross-team views (list pages only) ────────────────────────────────────
  if (pathname.startsWith("/dashboard/views/")) {
    return "cross_team_view";
  }

  // ── Request detail — canonical location is team → Active requests ─────────
  // URL: /dashboard/my-requests/:id (individual request)
  // When a request is open, highlight its team's Active requests
  if (pathname.match(/^\/dashboard\/my-requests\/[^/]+/) && streamContext) {
    return `team:${streamContext.teamSlug}:active_requests`;
  }

  // ── Team-scoped pages ─────────────────────────────────────────────────────
  const teamMatch = pathname.match(
    /^\/dashboard\/teams\/([^/]+)\/(active-requests|intake|commitments|prove|archive)/,
  );
  if (teamMatch) {
    const teamSlug = teamMatch[1];
    const section = teamMatch[2];
    switch (section) {
      case "active-requests":
        return `team:${teamSlug}:active_requests`;
      case "intake":
        return `team:${teamSlug}:intake_queue`;
      case "commitments":
        return `team:${teamSlug}:commitments`;
      case "prove":
        return `team:${teamSlug}:prove`;
      case "archive":
        return `team:${teamSlug}:archive`;
    }
  }

  // Default fallback
  return "my_streams";
}
