"use client"

import { createContext, useContext, useMemo } from "react"
import { useRouter } from "next/navigation"
import { requestListContextFromHref, requestListHref, type RequestListContext } from "@/lib/request-workspace"
import { planListUrlSync, withListContext, type DetailSessionPatch, type ListUrlSyncInput, type ListViewState, type SetListView } from "./list-view-state"
import { settleSequence, type DetailSequence } from "./request-sequence"

type NavigationState = { getView: () => ListViewState; setView: SetListView; setDetailSession: (patch: DetailSessionPatch) => void }
type NavigationBrowser = {
  location: () => { pathname: string; search: string }
  push: (href: string) => void
  replace: (href: string, options?: { scroll: boolean }) => void
}
type DetailIntent = { sequence?: DetailSequence | null; button?: "previous" | "next" | null }
type LinkActivation = {
  defaultPrevented: boolean; button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean
  currentTarget: { target?: string; hasAttribute?: (name: string) => boolean }
  preventDefault: () => void
}

/** Native new-tab/window/download gestures never change the original workspace. */
export function isSameTabRequestLink(event: LinkActivation): boolean {
  return !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
    && (!event.currentTarget.target || event.currentTarget.target === "_self") && !event.currentTarget.hasAttribute?.("download")
}

/** One instance per workspace, shared by every navigation surface. The list URL mirror remains its only in-place writer. */
export function createRequestNavigation(state: NavigationState) {
  let generation = 0
  let pendingPath: string | null = null
  let listSelectionPending = false
  let arrival: { id: string; sequence: DetailSequence | null; button: "previous" | "next" | null } | null = null
  let cancelFocus: (() => void) | null = null
  let rememberHistoryReturn: (() => void) | null = null
  let previewId: string | null = null
  function invalidate() {
    generation += 1
    cancelFocus?.(); cancelFocus = null
    arrival = null; pendingPath = null
    state.setDetailSession({ focusTitleOnArrival: false, focusOnArrival: null })
  }
  function prepareDetail(id: string, intent: DetailIntent = {}) {
    invalidate()
    listSelectionPending = false
    const { sequence = null, button = null } = intent
    arrival = { id, sequence, button }
    pendingPath = `/requests/${id}`
    state.setDetailSession({ sequence, focusTitleOnArrival: button === null, focusOnArrival: button })
  }
  function selectList(next: Partial<RequestListContext>, browser: NavigationBrowser) {
    const location = browser.location()
    const supersedesRoute = pendingPath !== null && pendingPath !== location.pathname
    invalidate()
    listSelectionPending = true
    const selected = withListContext(state.getView(), next)
    state.setView(next.project !== undefined && selected.pagination.pageIndex !== 0
      ? { ...selected, pagination: { ...selected.pagination, pageIndex: 0 } } : selected)
    if (location.pathname !== "/") {
      pendingPath = "/"
      browser.push(requestListHref(selected.status, selected.project))
    } else if (supersedesRoute) {
      // A detail transition may not have committed yet. Cancel it at the current URL;
      // the mirror still holds the selected context until pending mutations settle.
      browser.replace(`${location.pathname}${location.search}`)
    }
  }
  return {
    invalidate, prepareDetail, selectList,
    /** Local preview replacement/close is navigation too; an unchanged render is not. */
    previewChanged(id: string | null) {
      if (previewId === id) return
      previewId = id
      invalidate()
    },
    planListUrl(input: Omit<ListUrlSyncInput, "current" | "localSelectionPending">) {
      const current = state.getView()
      const href = requestListHref(current.status, current.project)
      // Both router state and the address bar must acknowledge the selection:
      // either can still show the previous route while its list is loading.
      if (input.pathname === "/" && href === `/${input.search ? `?${input.search}` : ""}`
        && href === `/${input.locationSearch}`) listSelectionPending = false
      return planListUrlSync({ ...input, current, localSelectionPending: listSelectionPending })
    },
    onHistoryReturn(remember: () => void) {
      rememberHistoryReturn = remember
      return () => { if (rememberHistoryReturn === remember) rememberHistoryReturn = null }
    },
    listenForHistory(target: Pick<Window, "addEventListener" | "removeEventListener">) {
      // This workspace listener precedes the router's restore listener. A
      // detail's later listener can be unmounted before dispatch reaches it.
      const restore = () => { rememberHistoryReturn?.(); listSelectionPending = false; invalidate() }
      target.addEventListener("popstate", restore)
      return () => { target.removeEventListener("popstate", restore); rememberHistoryReturn = null; listSelectionPending = false; invalidate() }
    },
    continuation() { const started = generation; return () => generation === started },
    deferFocus(focus: () => void) {
      cancelFocus?.()
      const started = generation
      let active = true
      const frame = requestAnimationFrame(() => { if (!active) return; cancelFocus = null; if (generation === started) focus() })
      const cancel = () => { active = false; cancelAnimationFrame(frame) }
      cancelFocus = cancel
      return cancel
    },
    arrive(id: string, focus: (button: "previous" | "next" | null) => void) {
      if (arrival?.id !== id) return false
      const target = arrival
      arrival = null; pendingPath = null
      state.setDetailSession({ sequence: settleSequence(target.sequence), focusTitleOnArrival: false, focusOnArrival: null })
      focus(target.button)
      return true
    },
    open(href: string, browser: NavigationBrowser) {
      const list = requestListContextFromHref(href)
      if (list) { selectList(list, browser); return true }
      const location = browser.location()
      if (href === location.pathname && !pendingPath) { invalidate(); return false }
      const request = /^\/requests\/([^/?#]+)(?:\?[^#]*)?$/.exec(href)
      if (request) prepareDetail(request[1])
      else { invalidate(); listSelectionPending = false; pendingPath = href.split("?")[0] }
      browser.push(href)
      return true
    },
    replaceDetail(id: string, intent: DetailIntent, browser: NavigationBrowser) {
      prepareDetail(id, intent)
      browser.replace(`/requests/${id}`, { scroll: false })
    },
  }
}

type RequestNavigation = ReturnType<typeof createRequestNavigation>
/** Bind a surface's router without giving it a separate generation or arrival store. */
export function bindRequestNavigation(controller: RequestNavigation, browser: NavigationBrowser) {
  return {
    invalidate: controller.invalidate, continuation: controller.continuation, deferFocus: controller.deferFocus,
    previewChanged: controller.previewChanged,
    onHistoryReturn: controller.onHistoryReturn,
    prepareDetail: controller.prepareDetail, arrive: controller.arrive,
    selectList: (next: Partial<RequestListContext>) => controller.selectList(next, browser),
    open: (href: string) => controller.open(href, browser),
    replaceDetail: (id: string, intent: DetailIntent) => controller.replaceDetail(id, intent, browser),
    followLink(event: LinkActivation, href: string, listIntent?: Partial<RequestListContext>) {
      if (!isSameTabRequestLink(event)) return false
      event.preventDefault()
      if (listIntent) controller.selectList(listIntent, browser)
      else controller.open(href, browser)
      return true
    },
  }
}

export const RequestNavigationContext = createContext<RequestNavigation | null>(null)
RequestNavigationContext.displayName = "RequestNavigation"

export function useRequestNavigation() {
  const controller = useContext(RequestNavigationContext)
  const router = useRouter()
  if (!controller) throw new Error("useRequestNavigation needs RequestListViewProvider.")
  return useMemo(() => bindRequestNavigation(controller, {
    location: () => window.location, push: href => router.push(href), replace: (href, options) => router.replace(href, options),
  }), [controller, router])
}
