import { Alert } from "@/components/arc/alert/alert";
import { FREE_REQUESTS, freeRequestsBlock, freeRequestsUsedReason, type FreeRequests, type PlanState } from "@/lib/free-request-rules";
import { SettingsCard } from "./settings-card";
import styles from "./settings.module.css";

export type FreeRequestsCardProps = {
  planState: PlanState;
  free: FreeRequests;
  /** Whether billing is enforced (`LANE_BILLING_ENFORCED`); off, nothing is ever blocked. */
  enforced: boolean;
};

const ABOUT = `Every workspace gets ${FREE_REQUESTS} Free Requests with all of Lane, for any number of people and no time limit. Each Request created counts, including deleted ones. A Guest submission counts once it’s taken on.`;

/**
 * #213 Settings → Billing, for Admins: the workspace's Free Requests left. When there are none it says why (used
 * here, or by another workspace from the creator's company domain) and, while billing is enforced, that an Admin
 * needs to pay. Paying is the Lane plan card beside it (#214).
 */
export function FreeRequestsCard({ planState, free, enforced }: FreeRequestsCardProps) {
  if (planState === "paying") return <SettingsCard title="Free Requests" description="This workspace pays for Lane, so creating Requests has no limit." />;
  const block = freeRequestsBlock(planState, free, { enforced });
  const note = block ?? (free.usedElsewhere ? freeRequestsUsedReason(free) : null);
  return <SettingsCard title="Free Requests" description={ABOUT}
    footer={enforced
      ? "After these, only creating Requests and taking on Guest submissions wait for payment."
      : "Lane isn’t charging yet, so creating Requests stays open after these are used."}>
    {note && <Alert role="status" tone={block ? "warning" : "info"} title={note} />}
    <div className={styles.rows}>
      <div className={styles.row}><div><strong>Free Requests left</strong></div><span className={styles.value}>{free.left} of {FREE_REQUESTS}</span></div>
    </div>
  </SettingsCard>;
}
