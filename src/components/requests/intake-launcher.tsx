import type { ReactNode } from "react";
import { SquarePen } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import buttonStyles from "@/components/arc/button/button.module.css";
import { NewRequestLink } from "./new-request-link";
import styles from "./intake-launcher.module.css";

/** `guide` (#217) is the first-run guide, which explains the steps the launcher's New Request opens. #285 (C23): the
 * launcher says New Request with the sidebar's new-item icon, like every other way to start one. */
export function IntakeLauncher({ guide }: { guide?: ReactNode }) {
  return (
    <div className={styles.launcher}>
      <EmptyState
        className={styles.emptyState}
        label="Start a Request"
        title="Start a new Request"
        description="Describe a problem for your team to solve."
        icon={<SquarePen data-icon-size="2xl" strokeWidth={1.5} />}
        action={
          // The composer returns focus here when it opened by itself (new-request-provider.tsx).
          <NewRequestLink data-intake-launcher="" guided={Boolean(guide)} className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>
            New Request
          </NewRequestLink>
        }
      />
      {guide && <div className={styles.guide}>{guide}</div>}
    </div>
  );
}
