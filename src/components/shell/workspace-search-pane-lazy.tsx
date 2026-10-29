"use client"

import { useEffect, useState, type ComponentType } from "react"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import type { WorkspaceSearchPaneProps } from "./workspace-search-pane"
import styles from "./workspace-search-pane.module.css"
import { Placeholder } from "@/components/loading/placeholder";

type Pane = ComponentType<WorkspaceSearchPaneProps>

// Plan item 2.8: the search pane (results, facets, preview, bottom sheets) stays out of every
// route's first load. The shell preloads it once the page is idle, and again when search opens;
// from then on it renders synchronously, with no fallback. The precedent is date-range-picker-lazy.tsx.
// It shares its dynamic import with the ⌘K palette (shell-lazy-surfaces.ts, #107).
let loaded: Pane | null = null
/** The one dynamic import of the shell's on-demand surfaces; the ⌘K palette's host loads through it too. */
export const loadShellSurfaces = () => import("./shell-lazy-surfaces")
const load = () => loadShellSurfaces().then(module => (loaded = module.WorkspaceSearchPane))

export function preloadWorkspaceSearch() {
  void load().catch(() => undefined)
}

/** The workspace search pane, loaded on demand. Props are the pane's. */
export function WorkspaceSearchPane(props: WorkspaceSearchPaneProps) {
  // The pane mounts once its module arrives, so its own focus-on-open runs then.
  const [Component, setComponent] = useState<Pane | null>(() => loaded)
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (Component) return
    let current = true
    load().then(pane => { if (current) setComponent(() => pane) }, () => { if (current) setFailed(true) })
    return () => { current = false }
  }, [Component, attempt])
  if (Component) return <Component {...props} />
  // The fallback follows the pane's own visibility: closing search hides it, as it hides the pane.
  return <div className={styles.root} hidden={!props.active}>
    {failed
      ? <div className={styles.loading}><div className={styles.error}><Alert tone="danger" title="Search unavailable">Search couldn't load. Check your connection and try again.</Alert>
        <Button variant="secondary" size="sm" onClick={() => { setFailed(false); setAttempt(value => value + 1) }}>Try again</Button></div></div>
      : <Placeholder><div className={styles.loading}><Skeleton label="Loading search" lines={3} /></div></Placeholder>}
  </div>
}
