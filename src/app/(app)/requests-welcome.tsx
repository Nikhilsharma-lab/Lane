import Link from "next/link"
import { Inbox } from "lucide-react"
import { NewRequestLink } from "@/components/requests/new-request-link"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import buttonStyles from "@/components/arc/button/button.module.css"
import styles from "./requests-overview.module.css"
import { KeyCap } from "@/components/keyboard/key-caps";

/** Plan item 2.1: the body of an empty workspace's records region. The list's
 * strip above it supplies the title, the guest note and the expand control, so
 * the first Request replaces only this content and nothing around it moves.
 * The C hint is CSS-gated to fine pointers, so server and client markup match;
 * on touch, `aria-keyshortcuts` on the links still exposes the shortcut. */
export function RequestsWelcome({ canInvite, isGuest, readOnly = false }: { canInvite: boolean; isGuest: boolean; readOnly?: boolean }) {
  // A Viewer (#210) files nothing, so the welcome only says where the team's Requests will appear.
  if (readOnly) return (
    <div data-requests-welcome className={styles.welcome}>
      <EmptyState label="No Requests yet" title="No Requests yet" description="Requests your team files appear here, with their predictions and results." icon={<Inbox data-icon-size="2xl" />} />
    </div>
  )
  return (
    <div data-requests-welcome className={styles.welcome}>
      <EmptyState
        label="No Requests yet"
        title="No Requests yet"
        // Guests: the strip's note says whose Requests show here, so this line does not repeat it,
        // and it still reads on its own at 640px and below, where that note is hidden.
        description={isGuest ? "Create a Request and follow it here." : "Create a Request for your team to review and pick up."}
        icon={<Inbox data-icon-size="2xl" />}
        action={<>
          <NewRequestLink className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>New Request</NewRequestLink>
          {canInvite && (
            <Link href="/settings/members" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}>
              Invite teammates
            </Link>
          )}
          {/* A span, not a p: EmptyState's `.root p` rule would restyle a paragraph. */}
          <span className={styles.shortcutHint}>Press <KeyCap>C</KeyCap> to create a Request.</span>
        </>}
      />
    </div>
  )
}
