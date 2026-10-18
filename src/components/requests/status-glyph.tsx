import type { SVGProps } from "react";
import styles from "./row-presentation.module.css";

export function StatusGlyph({ status, className, ...props }: { status: "open" | "in_progress" | "done" } & SVGProps<SVGSVGElement>) {
  return <svg {...props} className={[styles.status, className].filter(Boolean).join(" ")} data-status={status} data-ui-icon viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill={status === "done" ? "currentColor" : "none"} />
    {status === "in_progress" && <path d="M8 4a4 4 0 0 1 0 8Z" fill="currentColor" />}
    {status === "done" && <path d="m5 8 2 2 4-4" fill="none" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
}
