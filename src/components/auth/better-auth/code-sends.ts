/** #290 D12, #376: how long after a code was sent before Send a new code is offered. */
export const RESEND_WAIT_MS = 30_000

const addressKey = (email: string) => email.trim().toLowerCase()

/**
 * #377: when each address may be sent a code again. The wait counts from the last send to that address that sent
 * a code, so a refused send leaves Send usable at once. It outlives "Use a different email", but a corrected
 * address has its own wait (#376 story 21: the wait keeps a person from burning that address's codes). The server
 * keeps its own limits on top.
 */
export function createCodeSends(now: () => number) {
  const nextSendAt = new Map<string, number>()
  const next = (email: string) => nextSendAt.get(addressKey(email)) ?? 0
  return {
    /** When `email` may be sent a code again (ms since the epoch); 0 if it never was. */
    nextSendAt: next,
    waiting: (email: string) => now() < next(email),
    sent(email: string) {
      nextSendAt.set(addressKey(email), now() + RESEND_WAIT_MS)
    },
  }
}

/** Whole seconds left before a new code may be sent; 0 once it may. */
export const secondsUntil = (nextSendAt: number, now: number) => Math.max(0, Math.ceil((nextSendAt - now) / 1000))
