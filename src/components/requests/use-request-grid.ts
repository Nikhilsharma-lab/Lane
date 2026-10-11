"use client"

import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type RefObject } from "react"
import { gridCommand, headerOf, isGroupKey, isTypingTarget, listCommand, nextKey, requestIdOf, tabbableKey, type GridKey } from "./request-grid-keys"
import { isShown } from "./list-focus"

const OVERLAYS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

/** The same check as the C shortcut: a visible dialog, menu or listbox owns the keyboard. */
export function overlayOpen() {
  return Array.from(document.querySelectorAll<HTMLElement>(OVERLAYS)).some(element => element.getClientRects().length > 0 && element.getAttribute("aria-hidden") !== "true")
}

export type RequestGridOptions = {
  /** The grid or treegrid element. */
  gridRef: RefObject<HTMLElement | null>
  /** The list page around it (toolbar and grid); J, K and F work anywhere in it while it is shown. */
  scopeRef: RefObject<HTMLElement | null>
  /** The grid's rows in page order. */
  keys: GridKey[]
  /** The rows another page would show, so crossing a page can land on its first or last row. */
  keysForPage: (pageIndex: number) => GridKey[]
  /** The group a Request row belongs to, when grouped. */
  groupOf: (key: GridKey) => string | null
  isCollapsed: (group: string) => boolean
  setCollapsed: (group: string, collapsed: boolean) => void
  /** Toggles a Request's selection (X). */
  toggleSelected: (id: string) => void
  page: { index: number; count: number; go: (index: number) => void }
  /** Speaks a page crossing. */
  announce: (text: string) => void
}

/**
 * Plan item 2.4 (decision 8.24): the Requests list as an APG treegrid (grid
 * when ungrouped) with one roving tab stop. Only the row holding the tab stop
 * has tabIndex 0; a move re-renders two rows and focuses after the commit, so
 * the shared Arc ring (which skips tabindex="-1") always draws.
 */
export function useRequestGrid({ gridRef, scopeRef, keys, keysForPage, groupOf, isCollapsed, setCollapsed, toggleSelected, page, announce }: RequestGridOptions) {
  const [active, setActiveState] = useState<{ key: GridKey; index: number } | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const pendingFocus = useRef<GridKey | null>(null)
  const latestKeys = useRef(keys)
  useLayoutEffect(() => { latestKeys.current = keys })
  const tabbable = tabbableKey(keys, active)

  /** Moves the tab stop without moving focus (a click, a restored view). */
  const setActive = useCallback((key: GridKey, index?: number) => {
    setActiveState(current => current?.key === key ? current : { key, index: index ?? Math.max(0, latestKeys.current.indexOf(key)) })
  }, [])

  /** Moves the tab stop and focuses that row once it has committed as the tab stop. */
  const focusKey = useCallback((key: GridKey, index?: number) => {
    setActive(key, index)
    pendingFocus.current = key
    setFocusTick(tick => tick + 1)
  }, [setActive])

  useLayoutEffect(() => {
    const key = pendingFocus.current
    if (!key) return
    // One try, in the commit that made the row the tab stop: a request never waits to steal focus later.
    pendingFocus.current = null
    const element = gridRef.current?.querySelector(`[data-grid-row="${CSS.escape(key)}"]`)
    if (!isShown(element)) return
    element.focus({ preventScroll: true })
    // Instant, never smooth: a held J must not queue scroll animations.
    element.scrollIntoView({ block: "nearest" })
  }, [focusTick, keys, gridRef])

  /** Collapsing the group that holds the tab stop gives the stop to its header, as in APG. */
  const toggleGroup = useCallback((group: string, collapse: boolean) => {
    const header = `g:${group}`
    const current = active?.key
    if (collapse && current && current !== header && groupOf(current) === group) {
      const focused = document.activeElement instanceof Element && gridRef.current?.contains(document.activeElement)
      if (focused) focusKey(header)
      else setActive(header)
    }
    setCollapsed(group, collapse)
  }, [active?.key, focusKey, gridRef, groupOf, setActive, setCollapsed])

  const openFilter = useCallback(() => {
    const trigger = scopeRef.current?.querySelector<HTMLElement>('[data-slot="requests-toolbar"] [data-filter-trigger]')
    if (!isShown(trigger)) return false
    trigger.click()
    return true
  }, [scopeRef])

  const crossPage = (index: number, edge: "first" | "last") => {
    const target = keysForPage(index)
    const key = edge === "first" ? target[0] : target[target.length - 1]
    page.go(index)
    if (key) focusKey(key, edge === "first" ? 0 : target.length - 1)
    announce(`Page ${index + 1} of ${page.count}.`)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const grid = gridRef.current, target = event.target
    // Portalled menus and popovers bubble their keys through React; only the grid's own DOM counts.
    if (!grid || !(target instanceof Element) || !grid.contains(target)) return
    const row = target.closest<HTMLElement>("[data-grid-row]")
    const key = row?.dataset.gridRow
    if (!row || !key || !grid.contains(row)) return
    const command = gridCommand(event, isTypingTarget(target))
    if (!command || overlayOpen()) return
    const group = isGroupKey(key) ? key.slice(2) : null
    switch (command) {
      case "next": case "previous": case "first": case "last": {
        const move = nextKey(keys, key, command)
        if (!move) return
        if ("key" in move) focusKey(move.key)
        else if (move.edge === "next-page" && page.index + 1 < page.count) crossPage(page.index + 1, "first")
        else if (move.edge === "previous-page" && page.index > 0) crossPage(page.index - 1, "last")
        break
      }
      case "expand": {
        if (!group) return
        if (isCollapsed(group)) toggleGroup(group, false)
        else {
          const first = keys[keys.indexOf(key) + 1]
          if (first && !isGroupKey(first)) focusKey(first)
        }
        break
      }
      case "collapse": {
        if (group) { if (!isCollapsed(group)) toggleGroup(group, true) }
        else {
          const header = headerOf(keys, key)
          if (!header) return
          focusKey(header)
        }
        break
      }
      case "activate": {
        // Enter on a control inside the row is that control's own (a copy button, a link).
        if (target !== row) return
        if (group) toggleGroup(group, !isCollapsed(group))
        else row.querySelector<HTMLAnchorElement>("a[data-request-title]")?.click()
        break
      }
      case "select": {
        const id = requestIdOf(key)
        if (!id) return
        toggleSelected(id)
        break
      }
      case "filter": {
        if (!openFilter()) return
        break
      }
    }
    event.preventDefault()
  }

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const grid = gridRef.current, target = event.target
    if (!grid || !(target instanceof Element) || !grid.contains(target)) return
    const row = target.closest<HTMLElement>("[data-grid-row]")
    const key = row?.dataset.gridRow
    if (key && grid.contains(row)) setActive(key)
  }

  // J, K and F also work while focus is elsewhere on the list page: J and K
  // come back to the grid's tab stop, F opens Add filter. The grid handles its own keys first.
  const pageKey = useEffectEvent((event: globalThis.KeyboardEvent) => {
    const scope = scopeRef.current, target = event.target
    if (!scope || !isShown(scope)) return
    if (target instanceof Node && gridRef.current?.contains(target)) return
    const command = listCommand(event, isTypingTarget(target))
    if (!command || overlayOpen()) return
    if (command === "filter") { if (openFilter()) event.preventDefault(); return }
    const stop = gridRef.current?.querySelector<HTMLElement>('[role="row"][tabindex="0"]')
    if (!isShown(stop)) return
    event.preventDefault()
    stop.focus({ preventScroll: true })
    stop.scrollIntoView({ block: "nearest" })
  })
  useEffect(() => {
    const listener = (event: globalThis.KeyboardEvent) => pageKey(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  return { tabbable, setActive, focusKey, toggleGroup, gridProps: { onKeyDown, onFocus } }
}
