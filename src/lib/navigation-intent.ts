/**
 * When Lane last started moving this tab to another page: a router push or replace, or a plain click on a link
 * (both pass the offline guard, src/components/shell/offline-guard.tsx). The phone panel reads it as it closes
 * (src/components/popup/phone-sheet.tsx): a close that comes with a move must not step history back, or the
 * move is undone before Next.js records it. Browser-only, tiny: it is on every page.
 */
let startedAt = -Infinity

export const noteNavigation = () => { startedAt = performance.now() }

/** True when a move to another page started in the last `ms` milliseconds. */
export const navigatedWithin = (ms: number) => performance.now() - startedAt < ms
