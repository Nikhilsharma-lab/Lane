import { createElement, type ComponentProps, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, expect, it, vi } from "vitest"
import { CommandPalette } from "./command-palette"
import { PaletteOption } from "./command-palette-option"
import { InboxScreen } from "../inbox/inbox-screen"
import type { InboxViewProps } from "../inbox/inbox-view"
import type { InboxItem } from "../inbox/inbox-item"
import { RequestListViewProvider, useListViewSnapshot } from "../requests/list-view-state"
import { useRequestNavigation } from "../requests/request-navigation"
import { PickupConfirmationProvider } from "../requests/pickup-confirmation"
import { ToastStackProvider } from "../arc/toast-stack/toast-stack"
import { openSavedView, savedViewChoices } from "@/lib/saved-view-rules"

const captured = vi.hoisted(() => ({ options: new Map<string, ComponentProps<typeof PaletteOption>>(), inbox: null as InboxViewProps | null, push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: captured.push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
// Render boundaries only: production hooks, providers, choice callbacks and navigation are real.
vi.mock("../arc/dialog/dialog", () => ({ Dialog: ({ children }: { children: ReactNode }) => children, DialogContent: ({ children }: { children: ReactNode }) => children }))
vi.mock("./command-palette-option", () => ({ PaletteOption: (props: ComponentProps<typeof PaletteOption>) => { captured.options.set(props.entry.id, props); return null } }))
vi.mock("../inbox/inbox-view", () => ({ InboxView: (props: InboxViewProps) => { captured.inbox = props; return null } }))
vi.mock("@/app/(app)/requests/[id]/actions", () => ({}))
vi.mock("@/app/(app)/notifications/actions", () => ({}))

afterEach(() => { captured.options.clear(); captured.inbox = null; captured.push.mockClear(); vi.unstubAllGlobals() })

function renderConsumer(children: ReactNode) {
  let read: (() => ReturnType<typeof useListViewSnapshot>) | undefined
  let navigation: ReturnType<typeof useRequestNavigation> | undefined
  function Probe() { const snapshot = useListViewSnapshot(); read = () => snapshot; navigation = useRequestNavigation(); return null }
  renderToStaticMarkup(createElement(ToastStackProvider, null, createElement(RequestListViewProvider, null,
    createElement(Probe), createElement(PickupConfirmationProvider, null, children))))
  if (!read || !navigation) throw new Error("Workspace consumer did not mount")
  vi.stubGlobal("HTMLElement", class HTMLElement {})
  vi.stubGlobal("window", { location: { pathname: "/", search: "" } })
  const snapshot = read()
  if (!snapshot) throw new Error("Workspace snapshot is missing")
  return { navigation, snapshot }
}

it("the actual palette status callback edits the named view, while Project/search/list choices depart and another saved view swaps identity", () => {
  const closed = vi.fn()
  const app = renderConsumer(createElement(CommandPalette, { open: true, onOpenChange: closed, returnFocusRef: { current: null }, orgId: "org", role: "member", viewer: { id: "person", name: "Alex" }, projects: [{ id: "project", name: "Project" }] }))
  const saved = { id: "saved", name: "My saved view", filters: { status: "open" as const, project: "none" } }
  app.navigation.selectList({ ...saved.filters, savedView: saved.id })
  const option = captured.options.get("view:done")
  if (!option) throw new Error("Production palette did not offer Done")
  option.onChoose(option.entry)
  expect(app.snapshot()).toMatchObject({ status: "done", project: "none", savedView: "saved" })
  const open = openSavedView([saved], app.snapshot().savedView)
  expect(open?.name).toBe("My saved view")
  expect(savedViewChoices(open, app.snapshot())).toContain("update")
  expect(closed).toHaveBeenCalledWith(false)
  const project = [...captured.options.values()].find(option => option.entry.action.kind === "project")
  if (!project) throw new Error("Production palette did not offer a Project")
  project.onChoose(project.entry)
  expect(app.snapshot().savedView).toBeUndefined()
  for (const href of ["/?status=done&project=none", "/"]) {
    app.navigation.selectList({ ...saved.filters, savedView: saved.id })
    app.navigation.open(href)
    expect(app.snapshot().savedView).toBeUndefined()
  }
  app.navigation.selectList({ status: "all", project: "all", savedView: "other" })
  expect(app.snapshot().savedView).toBe("other")
})

it.each(["comment_added", "invite_accepted"] as const)("the actual Inbox %s mobile callback invalidates pending presentation before routing", type => {
  const item: InboxItem = { id: "notification", type, requestId: type === "invite_accepted" ? null : "request", readAt: "2026-10-25T10:00:00Z", createdAt: "2026-10-25T09:00:00Z", actorName: "Alex", requestTitle: "Request", requestNumber: 1, reframedProblem: "Problem", detail: null }
  const app = renderConsumer(createElement(InboxScreen, { orgId: "org", initialNeedsYou: [], showNeedsYou: false, initialItems: [item], initialUnread: 0, isGuest: false, viewer: { id: "person", name: "Alex", isAdmin: false } }))
  const current = app.navigation.continuation()
  if (!captured.inbox) throw new Error("Production Inbox did not render")
  captured.inbox.onSelect(item)
  expect(current()).toBe(false)
  expect(captured.push).toHaveBeenCalledExactlyOnceWith(type === "invite_accepted" ? "/settings/members" : "/requests/request")
})
