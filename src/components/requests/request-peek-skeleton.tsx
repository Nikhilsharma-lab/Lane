"use client"

import { X } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { PageStrip, PageStripProvider } from "@/components/shell/page-strip"
import { Placeholder } from "@/components/loading/placeholder"
import { KeyCap } from "@/components/keyboard/key-caps"
import detailStyles from "./detail.module.css"
import styles from "./request-peek.module.css"

/** The shell's trail and sidebar control belong to the page's strip, not the preview's. */
const PREVIEW_FRAME = { trail: [], expand: null, link: "a" as const }
export function PreviewFrame({ children }: { children: React.ReactNode }) {
  return <PageStripProvider value={PREVIEW_FRAME}>{children}</PageStripProvider>
}

export function PreviewClose({ onClose }: { onClose: () => void }) {
  return <Tooltip morph="plain" side="bottom" content={<>Close preview<KeyCap className={styles.kbd}>Esc</KeyCap></>}>
    <Button type="button" variant="ghost" size="sm" morph="plain" className={detailStyles.iconButton} aria-label="Close preview" onClick={onClose} data-request-peek-close="">
      <X strokeWidth={1.75} aria-hidden="true" />
    </Button>
  </Tooltip>
}

/** The loaded preview's boxes while its code or its Request loads. Close is there from the first frame.
 * #271 (A116): its own module, so the panel draws it before the content's code arrives, never a bare Close. */
export function PreviewSkeleton({ onClose }: { onClose: () => void }) {
  return <section className={detailStyles.root} aria-busy="true" data-skeleton="request-preview">
    <PreviewFrame><PageStrip leading={<PreviewClose onClose={onClose} />} title={<span aria-hidden="true" className="block w-16"><Skeleton lines={1} /></span>} /></PreviewFrame>
    <Placeholder><div className={styles.skeleton}>
      <div className={styles.skeletonTitle}><Skeleton label="Loading Request preview" lines={1} /></div>
      <div aria-hidden="true" className={styles.skeleton}><Skeleton lines={3} /><Skeleton lines={4} /></div>
    </div></Placeholder>
  </section>
}
