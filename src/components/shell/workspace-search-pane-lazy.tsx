"use client"

import { useState } from "react"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import type { WorkspaceSearchPaneProps } from "./workspace-search-pane"
import styles from "./workspace-search-pane.module.css"
import { Placeholder } from "@/components/loading/placeholder";

// Plan item 2.8: the search pane (results, facets, preview, bottom sheets) stays out of every
// route's first load. The shell preloads it once the page is idle, and again when search opens;
// from then on it renders synchronously, with no fallback. The precedent is date-range-picker-lazy.tsx.
/** The shell's on-demand surfaces (shell-lazy-surfaces.ts, #107): this pane and the ⌘K palette share one import. */
export const shellSurfaces = popupCode(() => import("./shell-lazy-surfaces"))

export const preloadWorkspaceSearch = shellSurfaces.preload

/** The workspace search pane, loaded on demand. Props are the pane's. */
export function WorkspaceSearchPane(props: WorkspaceSearchPaneProps) {
  const [failed, setFailed] = useState(false)
  // The pane mounts once its module arrives, so its own focus-on-open runs then. Try again fetches it once more.
  const surfaces = usePopupCode(shellSurfaces, !failed, () => setFailed(true))
  if (surfaces) return <surfaces.WorkspaceSearchPane {...props} />
  // The fallback follows the pane's own visibility: closing search hides it, as it hides the pane.
  return <div className={styles.root} hidden={!props.active}>
    {failed
      ? <div className={styles.loading}><div className={styles.error}><Alert tone="danger" title="Search unavailable">Search couldn’t load. Check your connection and try again.</Alert>
        <Button variant="secondary" size="sm" onClick={() => setFailed(false)}>Try again</Button></div></div>
      : <Placeholder><div className={styles.loading}><Skeleton label="Loading search" lines={3} /></div></Placeholder>}
  </div>
}
