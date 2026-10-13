"use client"

import { useCallback } from "react"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { useListAnnouncer } from "./list-announcer"

/** Copies through the clipboard and says the result in the polite region, or raises the list's failure toast.
 * Resolves with whether the value reached the clipboard. Shared by the row menu and Request detail (plan item 2.5). */
export function useCopy() {
  const announce = useListAnnouncer()
  const { toast } = useToastStack()
  return useCallback(async (value: string, copied: string) => {
    try {
      await navigator.clipboard.writeText(value)
      announce(copied, { key: "copy" })
      return true
    } catch {
      toast({ type: "error", title: "Could not copy", description: "Select the text and copy it instead." })
      return false
    }
  }, [announce, toast])
}
