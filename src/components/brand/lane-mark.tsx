import { LaneGlyph } from "./lane-glyph";
import styles from "./lane-mark.module.css";

/** The Lane mark: the glyph and the name. `className` places it; its look is its own. */
export function LaneMark({ className }: { className?: string }) {
  return <span className={className ? `${styles.mark} ${className}` : styles.mark} data-lane-mark=""><LaneGlyph /><span>Lane</span></span>;
}
