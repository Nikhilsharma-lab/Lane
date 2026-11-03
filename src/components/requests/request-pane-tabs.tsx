"use client"

import * as TabsPrimitive from "@radix-ui/react-tabs"
import { createContext, useContext, useRef, useState, type ReactElement, type ReactNode } from "react"
import { useDetailRequest } from "./detail-context"
import styles from "./request-pane-header.module.css"

export type RequestPaneSection = "overview" | "journey" | "activity" | "conversation"
const PaneSection = createContext<RequestPaneSection | null>(null)

/** Arc page-header's controlled Radix root. Panels stay mounted so switching never discards a draft. */
export function RequestPaneTabs({ children }: { children: ReactElement }) {
  const { peek } = useDetailRequest()
  const [section, setSection] = useState<RequestPaneSection>("overview")
  const root = useRef<HTMLDivElement>(null)
  if (!peek) return children
  function select(value: string) {
    setSection(value as RequestPaneSection)
    root.current?.querySelector<HTMLElement>("[data-detail-body]")?.scrollTo({ top: 0, behavior: "instant" })
  }
  return <PaneSection.Provider value={section}>
    <TabsPrimitive.Root asChild ref={root} value={section} onValueChange={select}
      onClickCapture={event => {
        const link = (event.target as Element).closest<HTMLAnchorElement>('a[href="#journey"]')
        if (link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          event.preventDefault()
          select("journey")
          root.current?.querySelector<HTMLButtonElement>('[role="tab"][data-section="journey"]')?.focus()
        }
      }}>{children}</TabsPrimitive.Root>
  </PaneSection.Provider>
}

export function RequestPanePanel({ value, children }: { value: RequestPaneSection; children: ReactNode }) {
  const selected = useContext(PaneSection)
  if (selected === null) return children
  return <TabsPrimitive.Content forceMount value={value} data-pane-section={value} hidden={selected !== value} className={styles.tabPanel}>
    {children}
  </TabsPrimitive.Content>
}
