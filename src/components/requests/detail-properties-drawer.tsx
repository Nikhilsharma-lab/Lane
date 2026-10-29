"use client"

import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog"
import { DetailProperties } from "./detail-properties"
import styles from "./detail.module.css"

/** Plan item 2.5: the Properties panel below 960px of content, loaded on first open (detail-properties.tsx). #263: Lane's adaptive popup, a bottom panel on phones. */
export function PropertiesDrawer({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocus: () => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {/* Opened from the state line, not a Radix trigger, so focus is handed back to it explicitly. */}
    <DialogContent title="Properties" sheetClassName={styles.sheet} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }}>
      <DetailProperties inSheet />
    </DialogContent>
  </Dialog>
}
