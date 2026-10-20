import { projectToneForId } from "@/lib/project-tone";
import { Folder } from "lucide-react";
import styles from "./project-dot.module.css";

/** Stable Project identity shared by navigation, pickers and saved values. */
export function ProjectMarker({ projectId }: { projectId: string | null | undefined }) {
  const empty = !projectId || projectId === "none";
  if (empty) return <Folder className={styles.empty} data-hollow aria-hidden="true" />;
  return <span className={styles.dot} data-tone={empty ? "slate" : projectToneForId(projectId)} data-hollow={empty || undefined} aria-hidden="true" />;
}
