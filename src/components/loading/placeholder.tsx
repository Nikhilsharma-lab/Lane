import type { ReactNode } from "react";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PlaceholderFrame } from "./placeholder-frame";

export interface PlaceholderProps {
  /** The loading shape: a page's own skeleton markup. Without it, an Arc Skeleton with `label`, `lines` and `avatar`. */
  children?: ReactNode;
  /** What the wait is announced as, for the default Arc Skeleton. */
  label?: string;
  lines?: number;
  avatar?: boolean;
  className?: string;
}

/**
 * #262 (polish bar §5): Lane's one placeholder, around Arc `skeleton`. Every route `loading.tsx` and
 * every in-page placeholder renders through it:
 *
 * - It stays invisible for `--duration-fast` (0.15s), so content that arrives quickly never shows a
 *   placeholder at all. Until then, what was clicked shows as pressed (`loading-feel-listeners.ts`).
 * - Then it fades in, and once it has shown, the content that replaces it fades in over
 *   `--duration-standard` (0.2s) (`loading-feel-listeners.ts`).
 * - With motion turned off it appears and disappears at once, after the same wait.
 *
 * Use it in place of a bare `<Skeleton>`: `<Placeholder label="Loading people" lines={3} />`, or wrap a
 * page's own skeleton shape: `<Placeholder><RequestDetailSkeleton /></Placeholder>`. The wrapper adds
 * no box, so the shape keeps its layout. Each page's own shape belongs to its screen.
 */
export function Placeholder({ children, label, lines, avatar, className }: PlaceholderProps) {
  return <PlaceholderFrame className={className}>{children ?? <Skeleton label={label} lines={lines} avatar={avatar} />}</PlaceholderFrame>;
}
