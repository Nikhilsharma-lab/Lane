import { Alert } from "@/components/arc/alert/alert"
import { SettingsRowFailure } from "./settings-group"
import styles from "./settings.module.css"

/** A refused account change on its row: what went wrong, and Try again when sending it again could help. */
export function AccountRowFailure({ problem: { line, retry } }: { problem: { line: string; retry?: () => void } }) {
  return retry
    ? <SettingsRowFailure title={line} onRetry={retry} />
    : <div className={styles.rowFailure}><Alert role="alert" tone="danger" title={line} /></div>
}
