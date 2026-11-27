import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { WorkspaceSidebarProps } from "@/components/arc/blocks/workspace-sidebar/workspace-sidebar"
import { AppProviders } from "@/test/app-providers"
import { fakeAuthFetch, type AuthFetchFake } from "@/test/auth-fetch-fake"

// #389 (#383 "Shell", stories 66 and 67): what the account menu is handed. Log out is Lane's own sign-out, then
// sign-in; the switcher lists the server's workspaces, and its current one is the session's.

let menu: WorkspaceSidebarProps | null = null
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))
vi.mock("@/components/arc/blocks/workspace-sidebar/workspace-sidebar", () => ({
  WorkspaceSidebar: (props: WorkspaceSidebarProps) => { menu = props; return null },
}))
vi.mock("./inbox-bell", () => ({ InboxBell: () => null }))
vi.mock("./command-palette-lazy", () => ({ CommandPaletteHost: () => null }))
// The switch action's own tests run it on the database (src/app/(app)/workspace-actions.test.ts).
vi.mock("@/app/(app)/workspace-actions", () => ({ switchWorkspace: vi.fn() }))

import { Sidebar } from "./sidebar"

const workspaces = [{ id: "org_atelier", name: "Atelier" }, { id: "org_studio", name: "Studio" }]

function accountMenu(list: typeof workspaces | null = workspaces) {
  renderToStaticMarkup(createElement(AppProviders, { orgId: "org_studio" }, createElement(Sidebar, {
    workspaceName: "Studio", fullName: "Test Person", email: "person@example.test", role: "member", orgId: "org_studio", userId: "user_1", workspaces: list,
  })))
  return menu!
}

describe("Log out", () => {
  let auth: AuthFetchFake
  const assign = vi.fn()
  beforeEach(() => {
    auth = fakeAuthFetch()
    assign.mockClear()
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it("sends one sign-out request, then opens sign-in as a full page load", async () => {
    const { onSignOut } = accountMenu()
    vi.stubGlobal("window", { location: { origin: "http://lane.test", assign } })
    await onSignOut!()
    expect(auth.requests.map(({ method, path }) => `${method} ${path}`)).toEqual(["POST /sign-out"])
    expect(assign.mock.calls).toEqual([["/login"]])
  })

  it("stays where it is when the sign-out didn't happen, so the menu can say so", async () => {
    auth.refuse("/sign-out", 500, "INTERNAL_SERVER_ERROR")
    const { onSignOut } = accountMenu()
    vi.stubGlobal("window", { location: { origin: "http://lane.test", assign } })
    await expect(onSignOut!()).rejects.toThrow()
    expect(assign).not.toHaveBeenCalled()
  })
})

describe("the workspace switcher's list", () => {
  it("is the server's, whole, with the session's workspace as its current one", () => {
    expect(accountMenu().workspaces).toMatchObject({ items: workspaces, currentId: "org_studio", error: null, pendingId: null })
  })

  it("says it couldn't load when the server's read failed, with a way to try again", () => {
    const { workspaces: shown } = accountMenu(null)
    expect(shown).toMatchObject({ items: [], error: "Couldn’t load workspaces. Try again." })
    expect(shown!.onRetry).toBeTypeOf("function")
  })
})
