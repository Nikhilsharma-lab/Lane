import type { ReactNode } from "react";
import styles from "./auth.module.css";

/** Arc form composition; Lane's existing controller supplies the contents. */
export function AuthFormCard({ title, description, children }: { title: string; description: ReactNode; children: ReactNode }) {
  return <section className={styles.form}>
    <header className={styles.heading}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.description}>{description}</div>
    </header>
    {children}
  </section>;
}
