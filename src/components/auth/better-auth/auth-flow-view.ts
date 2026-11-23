"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

import type { AuthFlowState } from "./auth-flow-store"

type ViewedFlow<S> = { subscribe: (listener: () => void) => () => void; snapshot: () => S; now: () => number }

/** A field, and the selector of what takes focus when it has a problem. */
export type FocusOrder<S extends AuthFlowState> = readonly (readonly [keyof S["fieldErrors"] & string, string])[]

/** #376 story 94: after a refused submit, focus goes to the first field in `order` with a problem, or to the box. */
export function focusRefusal<S extends AuthFlowState>({ fieldErrors, alert }: S, order: FocusOrder<S>, alertId: string) {
  const field = order.find(([name]) => fieldErrors[name])
  const target = field ? document.querySelector<HTMLElement>(field[1]) : alert ? document.getElementById(alertId) : null
  target?.focus()
}

/**
 * The sign-in, sign-up and reset screens' side of their flow: its state, the time the code step's countdown reads
 * (ticking each second until Send a new code is offered), and `act`, which runs an action and then puts focus on
 * what it refused.
 */
export function useAuthFlow<S extends AuthFlowState>(flow: ViewedFlow<S>, order: FocusOrder<S>, alertId: string) {
  const state = useSyncExternalStore(flow.subscribe, flow.snapshot, flow.snapshot)
  const [now, setNow] = useState(flow.now)
  const { nextSendAt } = state

  useEffect(() => {
    if (!nextSendAt) return
    const timer = window.setInterval(() => {
      const time = flow.now()
      setNow(time)
      if (time >= nextSendAt) window.clearInterval(timer)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [flow, nextSendAt])

  async function act(action: () => Promise<void>) {
    await action()
    setNow(flow.now())
    focusRefusal(flow.snapshot(), order, alertId)
  }

  return { state, now, act }
}
