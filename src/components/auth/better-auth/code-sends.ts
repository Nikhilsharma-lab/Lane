/** #290 D12, #376: how long after a code was sent before Send a new code is offered. */
export const RESEND_WAIT_MS = 30_000

/**
 * #377: when the next code may be sent. The wait counts from the last send that sent a code, so a refused send
 * leaves Send usable at once, and it outlives "Use a different email". The server keeps its own limits on top.
 */
export function createCodeSends(now: () => number) {
  let nextSendAt = 0
  return {
    nextSendAt: () => nextSendAt,
    waiting: () => now() < nextSendAt,
    sent() {
      nextSendAt = now() + RESEND_WAIT_MS
    },
  }
}

/** Whole seconds left before a new code may be sent; 0 once it may. */
export const secondsUntil = (nextSendAt: number, now: number) => Math.max(0, Math.ceil((nextSendAt - now) / 1000))
