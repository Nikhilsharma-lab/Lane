/**
 * #204: the Inbox page's list across re-reads. The server sends only unread items (a read item has cleared),
 * so an item the person read on this visit would vanish from under them while its Request is open beside the
 * list. It stays in its place, read, until the next visit. Pure, so the page and its tests share it.
 */

type Row = { id: string; createdAt: string; readAt: string | null }

/** The re-read's items, plus those shown read on this visit that it no longer has, newest first. */
export function refreshedItems<T extends Row>(shown: readonly T[], incoming: readonly T[]): T[] {
  const fresh = new Set(incoming.map(row => row.id))
  const readHere = shown.filter(row => row.readAt !== null && !fresh.has(row.id))
  return [...incoming, ...readHere].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

/**
 * #284 (C5): Back to the Inbox can show the page's copy from before the item the address holds open was opened on its
 * own page (inbox-screen.tsx). Opening it read it, so it shows read and the count leaves it out until the re-read lands.
 */
export function withOpenedRead<T extends Row>(items: readonly T[], unread: number, opened: string, at: string) {
  const shown = items.map(row => row.id === opened && row.readAt === null ? (unread--, { ...row, readAt: at }) : row)
  return { items: shown, unread }
}
