/**
 * When Lane last started moving this tab to another page: a router push or replace, or a plain click on a link
 * (both pass the offline guard, src/components/shell/offline-guard.tsx). The phone panel reads it as it closes
 * (src/components/popup/phone-sheet.tsx): a close that comes with a move must not step history back, or the
 * move is undone before Next.js records it; the command palette reads it to tell a page change started while it is
 * open from one already on its way (command-palette-lazy.tsx). Browser-only, tiny: it is on every page.
 */
let startedAt = -Infinity

export const noteNavigation = () => { startedAt = performance.now() }

/** When the last move started (performance.now() time). */
export const navigationStartedAt = () => startedAt

/**
 * #402: how many moves the router has been asked for, so the app frame can tell one that keeps the page (Impact's
 * period) from an address the page only rewrote (a list filter). A link's move changes the page, which says it all.
 */
let asked = 0

export const noteRouterMove = () => { asked++; noteNavigation() }

export const routerMoves = () => asked
