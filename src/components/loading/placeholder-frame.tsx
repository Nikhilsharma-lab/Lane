import type { ReactNode } from "react";
import styles from "./placeholder.module.css";

/**
 * #262 (polish bar §5): the timing half of Lane's one placeholder (`placeholder.tsx`), plain markup with
 * no browser code, so a page whose loading shape is its own markup (the sign-in card) ships nothing
 * extra. The wait and the fade are CSS; `loading-feel-listeners.ts` fades the content in after it.
 */
export function PlaceholderFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={[styles.placeholder, className].filter(Boolean).join(" ")} data-placeholder="">{children}</div>;
}
