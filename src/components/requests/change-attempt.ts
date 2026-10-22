/** One attempt at a Request change: the operation id the server replays by
 * and the revision the change was made against. */
export type ChangeAttempt = { key: string; operationId: string; expectedRevision: number }

/**
 * The attempt for `input` against `revision`. Sending the same input against
 * the same revision again keeps the operation id, so a save whose answer was
 * lost replays instead of applying twice. New input, or a reload that brings
 * a new revision, starts a new operation, so a "Request changed. Reload"
 * refusal is never repeated after the reload.
 */
export function changeAttempt(previous: ChangeAttempt | null, input: unknown, revision: number, newId: () => string = () => crypto.randomUUID()): ChangeAttempt {
  const key = JSON.stringify({ input, revision })
  return previous?.key === key ? previous : { key, operationId: newId(), expectedRevision: revision }
}
