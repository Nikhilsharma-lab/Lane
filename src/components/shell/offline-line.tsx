"use client"

import { Alert } from "@/components/arc/alert/alert"
import { useOffline } from "@/lib/connection-status"
import styles from "./offline-guard.module.css"

/** #260: the app frame's one quiet line while offline (Arc `alert`, compact). Loaded by OfflineGuard. */
export default function OfflineLine() {
  const offline = useOffline()
  return <div className={styles.line}><Alert open={offline} tone="warning" title="You're offline" className={styles.alert} /></div>
}
