"use client"

import { useCallback } from "react"
import { useToastStack, type ToastStackApi } from "@/components/arc/toast-stack/toast-stack"
import { useListAnnouncer, type Announce } from "./list-announcer"

export type CopyDeps = { writeText: (value: string) => Promise<void>; announce: Announce; toast: ToastStackApi["toast"] }

/** Copies through the clipboard and says the result in the polite region once it lands, or raises the list's failure toast.
 * Resolves with whether the value reached the clipboard. */
export async function copyAndSay({ writeText, announce, toast }: CopyDeps, value: string, copied: string) {
  try {
    await writeText(value)
    announce(copied, { key: "copy" })
    return true
  } catch {
    toast({ type: "error", title: "Couldn't copy", description: "Select the text and copy it instead." })
    return false
  }
}

/** copyAndSay through the browser's clipboard. Shared by the row menu and Request detail (plan item 2.5). */
export function useCopy() {
  const announce = useListAnnouncer()
  const { toast } = useToastStack()
  return useCallback((value: string, copied: string) => copyAndSay({ writeText: text => navigator.clipboard.writeText(text), announce, toast }, value, copied), [announce, toast])
}
