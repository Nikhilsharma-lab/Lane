"use client"

import dynamic from "next/dynamic"
import { useState, type ComponentType } from "react"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import type { WorkspaceSearchPaneProps } from "./workspace-search-pane"
import styles from "./workspace-search-pane.module.css"

type Pane = ComponentType<WorkspaceSearchPaneProps>

// Plan item 2.8: the search pane (results, facets, preview, bottom sheets) stays out of every
// route's first load. The shell preloads it once the page is idle, and again when search opens;
// from then on it renders synchronously, with no fallback. The precedent is date-range-picker-lazy.tsx.
let loaded: Pane | null = null
const load = () => import("./workspace-search-pane").then(module => (loaded = module.WorkspaceSearchPane))

export function preloadWorkspaceSearch() {
  void load().catch(() => undefined)
}

const LoadingPane = dynamic(load, { loading: () => <div className={styles.root}><div className={styles.loading}><Skeleton label="Loading search" lines={3} /></div></div> })

/** The workspace search pane, loaded on demand. Props are the pane's. */
export function WorkspaceSearchPane(props: WorkspaceSearchPaneProps) {
  // The choice holds for this mount: a pane that opened on the fallback finishes loading in place instead of remounting.
  const [Component] = useState<Pane>(() => loaded ?? LoadingPane)
  return <Component {...props} />
}
