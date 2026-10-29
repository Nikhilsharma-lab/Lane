"use client"

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"

type Router = ReturnType<typeof useRouter>
/** What the list's rows and the composer use. `refresh` is for useServerRefresh only (the ESLint ban on refresh). */
export type StableRouter = Pick<Router, "push" | "prefetch" | "refresh">

const StableRouterContext = createContext<StableRouter | null>(null)
StableRouterContext.displayName = "StableRouter"

/**
 * #296: Next 16's useRouter() also reads the nearest layout segment, so every caller re-renders whenever the router's
 * state changes, the list's status views writing ?status= with history.replaceState included, though the methods it
 * returns never change. The (app) layout reads the router here once; what it hands down never changes identity and
 * always calls the current router.
 */
export function StableRouterProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const latest = useRef(router)
  useLayoutEffect(() => { latest.current = router })
  const [stable] = useState<StableRouter>(() => ({
    push: (...args) => latest.current.push(...args),
    prefetch: (...args) => latest.current.prefetch(...args),
    refresh: () => latest.current.refresh(),
  }))
  return <StableRouterContext.Provider value={stable}>{children}</StableRouterContext.Provider>
}

/** The router for components rendered many times over (the list's rows) or kept mounted while closed (the composer's
 * form): it never re-renders them. Needs StableRouterProvider (the (app) layout). */
export function useStableRouter(): StableRouter {
  const router = useContext(StableRouterContext)
  if (!router) throw new Error("useStableRouter needs StableRouterProvider (the (app) layout).")
  return router
}
