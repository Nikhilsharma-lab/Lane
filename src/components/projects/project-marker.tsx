import { projectToneForId } from "@/lib/project-tone";
import styles from "./project-dot.module.css";

/** Stable Project identity shared by navigation, pickers and saved values. */
export function ProjectMarker({ projectId }: { projectId: string | null | undefined }) {
  const empty = !projectId || projectId === "none";
  return <span className={styles.dot} data-tone={empty ? "slate" : projectToneForId(projectId)} data-hollow={empty || undefined} aria-hidden="true" />;
}
