/**
 * #260: thrown by `callAction` (src/lib/action-call.ts) instead of calling the server while the browser is offline
 * (src/lib/connection-status.ts). Its words are in failure-messages.ts. Plain, so server modules that share those
 * words can import it too.
 */
export class OfflineError extends Error {}
