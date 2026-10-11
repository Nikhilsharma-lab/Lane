import type { ReactNode } from "react";
import styles from "@/components/settings/profile.module.css";
import { PageStrip } from "@/components/shell/page-strip";

/** Clerk owns memberships and invitations; Arc owns the page's visual tokens. */
export function MembersHost({ children }: { children: ReactNode }) {
  return <><PageStrip title="Members" /><div className={styles.page}><h1 className={styles.title}>Members</h1><div className="min-w-0">{children}</div></div></>;
}
