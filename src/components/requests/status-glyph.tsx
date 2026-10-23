import type { SVGProps } from "react";
import type { JourneyStatus } from "@/lib/request-journey";
import styles from "./row-presentation.module.css";

/**
 * One glyph per journey status (#133): an empty ring (Open), a half-filled ring (In progress), a ring
 * with a check (Done), a ring with clock hands (Measuring: waiting for the result) and a filled ring
 * with a check (Closed). Colour comes from the status's token in row-presentation.module.css.
 */
export function StatusGlyph({ status, className, ...props }: { status: JourneyStatus } & SVGProps<SVGSVGElement>) {
  const filled = status === "closed";
  return <svg {...props} className={[styles.status, className].filter(Boolean).join(" ")} data-status={status} data-ui-icon viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" fill={filled ? "currentColor" : "none"} />
    {status === "in_progress" && <path d="M8 4a4 4 0 0 1 0 8Z" fill="currentColor" />}
    {status === "done" && <path d="m5.5 8 1.75 1.75L10.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    {status === "measuring" && <path d="M8 5v3l2 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
    {filled && <path d="m5 8 2 2 4-4" fill="none" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
  </svg>
}
