"use client";

import type { CSSProperties } from "react";
import styles from "./skeleton.module.css";

/* Lane adaptation (#262, polish bar §5): Lane's one placeholder is src/components/loading/placeholder.tsx,
 * which times and fades every loading shape. Arc's own crossfade mode (`children` with `loading`, and its
 * height spring) is removed so there is only one, and with it its motion code. */
export interface SkeletonProps {
  label?: string;
  lines?: number;
  avatar?: boolean;
  className?: string;
}

export function Skeleton({ label = "Loading content", lines = 3, avatar = false, className }: SkeletonProps) {
  const count = Math.min(Math.max(Math.floor(lines), 1), 6);
  // Each block pulses a beat after the one above it, so the wait reads as one calm wave.
  return <div className={[styles.root, className].filter(Boolean).join(" ")} role="status" aria-label={label} aria-busy="true">
    {avatar && <span className={styles.avatar} aria-hidden="true" />}
    <span className={styles.lines} aria-hidden="true">{Array.from({ length: count }, (_, index) => <span className={styles.line} style={{ "--index": index + (avatar ? 1 : 0) } as CSSProperties} key={index} />)}</span>
  </div>;
}

export default Skeleton;
