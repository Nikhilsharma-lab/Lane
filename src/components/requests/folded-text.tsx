"use client"

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/arc/button/button"
import styles from "./detail.module.css"

/**
 * #281 (B22): a long description shows about ten lines, then Show more; Show less folds it again. The fold snaps, with
 * no height animation (request-pane-composition.md). The page draws the folded text; the button appears only once the
 * browser has measured that the text runs past its ten lines, so a short description never offers it. Comments never
 * fold.
 */
export function FoldedText({ className, children }: { className: string; children: ReactNode }) {
  const id = useId()
  const text = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [overflows, setOverflows] = useState(false)
  useLayoutEffect(() => {
    const node = text.current
    if (!node || open) return
    const measure = () => setOverflows(node.scrollHeight > node.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [open])
  return <>
    <p ref={text} id={id} className={className} data-fold-text="" data-folded={open ? undefined : ""}>{children}</p>
    {(overflows || open) && <Button type="button" variant="ghost" size="sm" morph="plain" className={styles.foldButton} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>{open ? "Show less" : "Show more"}</Button>}
  </>
}
