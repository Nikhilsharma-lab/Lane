"use client"

import { createContext, useContext, type ComponentProps, type ReactNode } from "react"

/**
 * Page-quality 2.12: the Request page's title is its h1 and its sections are h2. In the preview the title is the
 * panel's h2 (the list keeps the page's h1), so every heading inside it sits one level lower. The Request detail
 * components write the page's level; the preview's frame shifts them.
 */
const Shift = createContext(0)

export function PreviewHeadings({ children }: { children: ReactNode }) {
  return <Shift value={1}>{children}</Shift>
}

type Level = 2 | 3 | 4 | 5 | 6

export function SectionHeading({ level, ...props }: { level: 2 | 3 | 4 } & ComponentProps<"h2">) {
  // HTML stops at h6.
  const Heading: `h${Level}` = `h${Math.min(level + useContext(Shift), 6) as Level}`
  return <Heading {...props} />
}
