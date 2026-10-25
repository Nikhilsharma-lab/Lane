import { createExternalStore } from "@/lib/external-store"

/**
 * #204: while the Inbox page is open it owns the unread count (its own mark read, unread and all read show
 * on the bell in the same frame). It publishes the count here and clears it (null) when it unmounts; the
 * bell then reads the count from the server again.
 */
export const inboxUnread = createExternalStore<number | null>(null)
