import { createExternalStore } from "@/lib/external-store"

/**
 * #204 / #205: while the Inbox page is open it owns the bell's count, its Needs-you items as last read (they
 * leave the moment the thing is done, so the page and the bell agree). It publishes the count here and clears
 * it (null) when it unmounts; the bell then reads the count from the server again.
 */
export const inboxNeedsYou = createExternalStore<number | null>(null)
