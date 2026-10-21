import { RotateCwIcon } from "lucide-react";
import buttonStyles from "@/components/arc/button/button.module.css";
import styles from "./auth.module.css";

/**
 * Decision 2026-10-21 (critique 2.11): what stands in for Clerk's card once Clerk reports it could not load
 * (a blocker, no connection), instead of a skeleton that never resolves. The pages show it inside Clerk's
 * `ClerkFailed` and the skeleton inside `ClerkLoading`; it reads nothing from Clerk, so stories render it.
 * Plain server markup: Reload is a document link to the same page (a full load), on Arc's button styles,
 * so a rarely seen state adds no client code to the auth routes' first load.
 */
export function ClerkUnavailable({ title, href }: { title: string; href: string }) {
  return <div role="alert" className={styles.unavailable}>
    <div className={styles.heading}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>Check your connection, or turn off blockers for this site, then reload.</p>
    </div>
    <a href={href} className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md} w-full`}>
      <RotateCwIcon aria-hidden="true" data-icon="inline-start" />Reload
    </a>
  </div>;
}
