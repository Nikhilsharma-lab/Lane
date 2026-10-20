import type { ReactNode } from "react";
import styles from "./settings.module.css";

/** Vercel's settings fieldset structure, using Lane tokens and Arc controls. */
export function SettingsCard({ title, description, children, footer, action }: {
  title: string; description?: string; children?: ReactNode; footer?: ReactNode; action?: ReactNode;
}) {
  return <section className={styles.card}>
    <div className={styles.cardBody}><h3>{title}</h3>{description && <p>{description}</p>}{children}</div>
    {(footer || action) && <div className={styles.cardFooter}><div>{footer}</div>{action}</div>}
  </section>;
}
