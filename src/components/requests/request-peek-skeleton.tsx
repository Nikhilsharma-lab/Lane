"use client"

import { X } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Placeholder } from "@/components/loading/placeholder"
import { PageStrip, PageStripProvider } from "@/components/shell/page-strip"
import detailStyles from "./detail.module.css"
import headerStyles from "./request-pane-header.module.css"
import styles from "./request-peek.module.css"

const FRAME = { trail: [], expand: null, link: "a" as const }

export function RequestPeekSkeleton({ onClose }: { onClose: () => void }) {
  return <section className={detailStyles.root} aria-busy="true" data-skeleton="request-preview">
    <PageStripProvider value={FRAME}>
      <PageStrip leading={<Button variant="ghost" size="sm" className={detailStyles.iconButton} aria-label="Close preview" onClick={onClose}><X aria-hidden="true" /></Button>}
        title={<span aria-hidden="true" className="block w-16"><Skeleton lines={1} /></span>} />
    </PageStripProvider>
    <Placeholder>
      <div className="shrink-0 px-5 pt-4 md:px-8">
        <div className={headerStyles.header}>
          <div className={headerStyles.introInner}>
            <div className={styles.skeletonTitle}><Skeleton label="Loading Request preview" lines={1} /></div>
            <div aria-hidden="true" className={styles.skeletonStatus}><Skeleton lines={1} /></div>
            <div aria-hidden="true" className={styles.skeletonMeta}><Skeleton lines={1} avatar /></div>
          </div>
          <div className={styles.skeletonTabs} aria-hidden="true"><Skeleton lines={1} /></div>
        </div>
      </div>
      <div aria-hidden="true" className={`${detailStyles.body} px-5 py-6 md:px-8`}>
        <div className={styles.skeletonBlocks}><Skeleton lines={3} /><Skeleton lines={4} /></div>
      </div>
    </Placeholder>
  </section>
}
