import { Inbox } from "lucide-react";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import buttonStyles from "@/components/arc/button/button.module.css";
import { NewRequestLink } from "./new-request-link";
import styles from "./intake-launcher.module.css";

export function IntakeLauncher() {
  return (
    <div className={styles.launcher}>
      <h1 className="sr-only">Intake</h1>
      <EmptyState
        className={styles.emptyState}
        label="Start a Request"
        title="Start a new Request"
        description="Describe a problem for your team to solve."
        icon={<Inbox size={24} strokeWidth={1.5} />}
        action={
          <NewRequestLink className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>
            Create Request
          </NewRequestLink>
        }
      />
    </div>
  );
}
