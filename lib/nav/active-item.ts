/**
 * getActiveNavItem — determines which sidebar item to highlight.
 *
 * Rules from nav-spec section 6:
 * - A stream's canonical location is always {team} → Active streams
 * - Validation gate/cross-team views highlight on the list;
 *   click into a stream → highlight moves to team's Active streams
 * - Inbox stays highlighted during triage flow
 * - Cross-team view stays visible (not highlighted) when viewing a stream from it
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
  | `team:${string}:active_streams`
  | `team:${string}:intake_queue`
  | `team:${string}:commitments`
  | `team:${string}:validation_gate`
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
  if (pathname === "/dashboard/streams" || pathname === "/dashboard/streams/") {
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

  // ── Stream detail — canonical location is team → Active streams ���──────────
  // URL: /dashboard/streams/:id (individual stream)
  // When a stream is open, highlight its team's Active streams
  if (pathname.match(/^\/dashboard\/streams\/[^/]+/) && streamContext) {
    return `team:${streamContext.teamSlug}:active_streams`;
  }

  // ── Team-scoped pages ─────────────────────────────────────────────────────
  const teamMatch = pathname.match(
    /^\/dashboard\/teams\/([^/]+)\/(streams|intake|commitments|validation|archive)/,
  );
  if (teamMatch) {
    const teamSlug = teamMatch[1];
    const section = teamMatch[2];
    switch (section) {
      case "streams":
        return `team:${teamSlug}:active_streams`;
      case "intake":
        return `team:${teamSlug}:intake_queue`;
      case "commitments":
        return `team:${teamSlug}:commitments`;
      case "validation":
        return `team:${teamSlug}:validation_gate`;
      case "archive":
        return `team:${teamSlug}:archive`;
    }
  }

  // Default fallback
  return "my_streams";
}
