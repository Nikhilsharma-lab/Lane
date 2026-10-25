import type { ForYourInformationItem, NeedsYouItem } from "@/lib/inbox-read-model"

/** A For-your-information item as the page and GET /api/notifications hand it to the browser: dates are ISO strings. */
export type InboxItem = Omit<ForYourInformationItem, "readAt" | "createdAt"> & { readAt: string | null; createdAt: string }

export const toInboxItem = (item: ForYourInformationItem): InboxItem => ({ ...item, readAt: item.readAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString() })

/** A Needs-you item as the browser gets it: `since` is an ISO string. */
export type NeedsYouInboxItem = Omit<NeedsYouItem, "since"> & { since: string }

export const toNeedsYouItem = (item: NeedsYouItem): NeedsYouInboxItem => ({ ...item, since: item.since.toISOString() })
