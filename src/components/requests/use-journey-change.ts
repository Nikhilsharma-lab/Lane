"use client"
import { useRef, useState } from "react"
import type { RequestChangeContext } from "@/lib/request-reviewer-rules"
import { changeAttempt, type ChangeAttempt } from "./change-attempt"
import { useOptimisticAction, type ActionResult } from "./use-optimistic-action"

/**
 * One journey change (release, closure, correction, follow-up, handover) from a timeline form. Runs one save
 * at a time, keeps the operation id across retries of the same input so a lost answer replays rather than
 * applying twice, and reports refusals inline. The caller's input stays in its form until the save succeeds.
 */
export function useJourneyChange({ requestId, orgId, failed }: { requestId: string; orgId: string; failed: string }) {
  const runAction = useOptimisticAction()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const retry = useRef<ChangeAttempt | null>(null)
  const running = useRef(false)

  async function save<R extends ActionResult>(input: unknown, revision: number, call: (context: RequestChangeContext) => Promise<R>): Promise<Exclude<R, { error: string }> | null> {
    if (running.current) return null
    running.current = true
    setBusy(true)
    setError("")
    const attempt = retry.current = changeAttempt(retry.current, input, revision)
    try {
      const outcome = await runAction({
        id: requestId, refreshOnError: false,
        run: () => call({ orgId, requestId, operationId: attempt.operationId, expectedRevision: attempt.expectedRevision }),
        onError: message => setError(message),
      })
      if (outcome.status !== "success") return null
      retry.current = null
      return outcome.value as Exclude<R, { error: string }>
    } catch {
      setError(failed)
      return null
    } finally {
      running.current = false
      setBusy(false)
    }
  }

  return { busy, error, save }
}
