"use client"

import { Drawer, DrawerContent } from "@/components/arc/drawer/drawer"
import { DetailProperties } from "./detail-properties"
import styles from "./detail.module.css"

/** Plan item 2.5: the phone's Properties sheet, loaded on first open (detail-properties.tsx). */
export function PropertiesDrawer({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocus: () => void }) {
  return <Drawer open={open} onOpenChange={onOpenChange}>
    {/* Opened from the state line, not a Radix trigger, so focus is handed back to it explicitly. */}
    <DrawerContent side="bottom" title="Properties" className={styles.sheet} onCloseAutoFocus={event => { event.preventDefault(); returnFocus() }}>
      <DetailProperties inSheet />
    </DrawerContent>
  </Drawer>
}
