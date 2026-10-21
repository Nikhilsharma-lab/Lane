import { WifiOffIcon } from "lucide-react";
import { AuthAction } from "./auth-action";
import { AuthHeading } from "./auth-shell";
import styles from "./auth.module.css";

/**
 * Decision 2026-10-21 (critique 2.11): what stands in for Clerk's card once Clerk reports it could not load
 * (a blocker, no connection), instead of a skeleton that never resolves. Clerk-free, so stories render it.
 */
export function ClerkUnavailable({ title, onReload }: { title: string; onReload: () => void }) {
  return <div role="alert" className={styles.unavailable}>
    <AuthHeading title={title} description="Check your connection, or turn off blockers for this site, then reload." />
    <AuthAction type="button" icon={WifiOffIcon} onClick={onReload}>Reload</AuthAction>
  </div>;
}
