import type { ReactNode } from "react";
import styles from "./auth.module.css";

/** Plan item 2.11: `concealed` keeps a header action's place but hides it from sight, the tab order and assistive tech. */
export function AuthHeaderSlot({ concealed = false, children }: { concealed?: boolean; children: ReactNode }) {
  return <div className={styles.headerSlot} data-concealed={concealed || undefined}>{children}</div>;
}
