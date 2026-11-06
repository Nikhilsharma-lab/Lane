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
