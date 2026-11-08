"use client"

import { useEffect, useLayoutEffect, useState, type RefObject } from "react"
import { afterPageLoad } from "@/lib/after-page-load"
import { useServerRefresh } from "./use-optimistic-action"

let motion: typeof import("./list-motion") | null = null

/** #275: loads list-motion.ts after the page and runs it; its notes say what each part does and why. */
export function useListFeel(gridRef: RefObject<HTMLElement | null>, scrollRef: RefObject<HTMLElement | null>, rows: unknown, still: string, href: string, scope: string, hold: boolean) {
  const [code, setCode] = useState(motion)
  useEffect(() => code ? undefined : afterPageLoad(() => { void import("./list-motion").then(module => setCode(motion = module)) }), [code])
  const refresh = useServerRefresh()
  const [feel] = useState(() => ({ running: new Set<Animation>(), href }))
  useLayoutEffect(() => { code?.commit(feel, gridRef.current, still, href, hold, refresh) }, [code, feel, gridRef, rows, still, href, hold, refresh])
  useLayoutEffect(() => code?.mount(feel, scrollRef.current, scope), [code, feel, scrollRef, scope])
}
