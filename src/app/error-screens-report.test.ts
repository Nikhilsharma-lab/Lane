import { createElement, type ComponentType } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AppProviders } from "@/test/app-providers"

// #271 (A120): every error screen people can reach reports what went wrong through the shared client reporter.
// The server render runs no effects, so this one runs effects as they render. Effects of the parts inside a screen
// that need a browser (motion, observers) throw here and are skipped; the screen's own report effect needs none.
const reportClientError = vi.hoisted(() => vi.fn(async () => {}))
vi.mock("@/lib/report-client-error", () => ({ reportClientError }))
vi.mock("react", async original => {
  const react = await original<typeof import("react")>()
  return { ...react, useEffect: (effect: () => void) => { try { effect() } catch { /* needs a browser */ } } }
})
vi.mock("@clerk/nextjs", () => ({ useOrganization: () => ({ isLoaded: false }), useClerk: () => ({ signOut: vi.fn() }) }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))

const { default: AppError } = await import("./(app)/error")
const { default: AuthError } = await import("./(auth)/error")
const { default: RootError } = await import("./error")

describe("error screens", () => {
  beforeEach(() => { reportClientError.mockClear(); vi.spyOn(console, "error").mockImplementation(() => {}) })

  it.each([
    ["the in-app error", AppError as ComponentType<{ error: Error; retry: () => void; reset: () => void }>, "page"],
    ["the sign-in error", AuthError as ComponentType<{ error: Error; retry: () => void; reset: () => void }>, "sign-in"],
    ["the root error", RootError as ComponentType<{ error: Error; retry: () => void; reset: () => void }>, "workspace"],
  ])("%s reports the error it shows", (_name, Screen, boundary) => {
    const error = Object.assign(new Error("Illustrative"), { digest: "abc123" })
    renderToStaticMarkup(createElement(AppProviders, null, createElement(Screen, { error, retry: () => {}, reset: () => {} })))
    expect(reportClientError).toHaveBeenCalledWith(error, { boundary, digest: "abc123" })
  })
})
