"use client"
import { useLayoutEffect, useRef, type ReactNode } from "react"
import { firstFocusTarget, focusWithoutScroll } from "@/components/popup/focus"
import popupStyles from "@/components/popup/popup.module.css"

/**
 * #277: a form that arrives in a popup already open (its code or its read came after the popup opened) takes focus to
 * its first field, as the popup does for what it opens with, unless focus is already inside it.
 */
export function FocusOnArrival({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!ref.current?.contains(document.activeElement)) focusWithoutScroll(firstFocusTarget(ref.current))
  }, [])
  return <div ref={ref} className={popupStyles.content}>{children}</div>
}
