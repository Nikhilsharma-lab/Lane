import { ChevronDown } from "lucide-react";
import { Alert } from "@/components/arc/alert/alert";
import { afterFreeRequestsLine, FREE_REQUESTS, freeRequestsBlock, freeRequestsSharedNote, freeRequestsUsedReason, type FreeRequests, type PlanState } from "@/lib/free-request-rules";
import { SettingsBlock, SettingsGroup, SettingsRow } from "./settings-group";
import styles from "./settings.module.css";

export type FreeRequestsCardProps = {
  planState: PlanState;
  free: FreeRequests;
  /** Whether billing is enforced (`LANE_BILLING_ENFORCED`); off, nothing is ever blocked. */
  enforced: boolean;
};

/** #287: what one short line leaves out, behind "How Free Requests work". */
const ABOUT = `Every workspace gets ${FREE_REQUESTS} Free Requests with all of Lane, for any number of people and no time limit, shared with any other workspace from the same company email domain. Each Request created counts, including deleted ones.`;

/**
 * #213 Settings → Billing, for Admins: the workspace's Free Requests left, and when another workspace from the
 * creator's company domain shares them, what it used. When there are none it says why and, while billing is enforced,
 * that an Admin needs to pay. Paying is the Lane plan card beside it (#214).
 *
 * #287: one row group. "Free Requests left" as "N of M" with one short line; the rest folds behind "How Free
 * Requests work". While Lane is free, the Billing section's pilot line says so once, so this card doesn't.
 */
export function FreeRequestsCard({ planState, free, enforced }: FreeRequestsCardProps) {
  if (planState === "paying") return <SettingsGroup label="Free Requests" labelId="free-requests-title">
    <SettingsBlock><p>This workspace pays for Lane, so creating Requests has no limit.</p></SettingsBlock>
  </SettingsGroup>;
  const block = freeRequestsBlock(planState, free, { enforced });
  const note = block ?? (free.usedElsewhere ? freeRequestsSharedNote(free) ?? freeRequestsUsedReason(free) : null);
  return <SettingsGroup label="Free Requests" labelId="free-requests-title">
    <SettingsRow label="Free Requests left" hint={afterFreeRequestsLine({ enforced })} control={`${free.left} of ${FREE_REQUESTS}`} />
    {note && <SettingsBlock><Alert role="status" tone={block ? "warning" : "info"} title={note} /></SettingsBlock>}
    <details className={styles.fold}>
      <summary><span>How Free Requests work</span><ChevronDown data-icon-size="sm" aria-hidden="true" /></summary>
      <p>{ABOUT}</p>
    </details>
  </SettingsGroup>;
}
