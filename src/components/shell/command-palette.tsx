"use client"

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { SearchField } from "@/components/arc/search-field/search-field"
import { useListAnnouncer } from "@/components/requests/list-announcer"
import { useCurrentRequest, useRequestListContext, useSetRequestListView, withListContext } from "@/components/requests/list-view-state"
import { useUndoableMarkDone } from "@/components/requests/mark-done-undo"
import { useRequestMoves } from "@/components/requests/request-moves"
import { showSettingsSection } from "@/components/settings/settings-section"
import { isShown } from "@/lib/keyboard-guards"
import { changesListInPlace, requestListHref, type RequestListContext } from "@/lib/request-workspace"
import { filterPaletteEntries, paletteEntries, priorityEntries, type PaletteEntry, type PaletteRole, type PriorityEntry } from "./command-palette-entries"
import { openableEntries, runPaletteAction, type PaletteActionDeps } from "./command-palette-actions"
import { PaletteOption } from "./command-palette-option"
import { paletteListKey, type PaletteStep } from "./command-palette-keys"
import { createPaletteFocus } from "./command-palette-focus"
import { canOpenShellSurface, openShellSurface } from "./shell-openers"
import styles from "./command-palette.module.css"

export type CommandPaletteWorkspace = {
  orgId: string
  /** The Clerk workspace role. */
  role: PaletteRole
  /** Who a Pick up from Request detail names as Assignee. */
  viewer: { id: string; name: string }
  projects: readonly { id: string; name: string }[]
}

export type CommandPaletteProps = CommandPaletteWorkspace & {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What had focus when ⌘K was pressed. */
  returnFocusRef: RefObject<HTMLElement | null>
}


/**
 * Issue #106 (spec #101): the ⌘K command palette, loaded on demand by
 * command-palette-lazy.tsx. Arc's DialogContent holds Arc's SearchField as
 * an APG combobox: the field keeps focus, aria-activedescendant names the
 * active option, options are grouped, and the result count is polite.
 *
 * Under reduced motion Arc's Dialog still fades its layers; the palette's CSS
 * holds both at full opacity there and hides them once closed, so it opens
 * and closes with no animation.
 */
export function CommandPalette({ open, onOpenChange, returnFocusRef, ...workspace }: CommandPaletteProps) {
  const [step, setStep] = useState<PaletteStep>("entries")
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const [focus] = useState(() => createPaletteFocus(returnFocusRef, isShown))
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) { setStep("entries"); setQuery(""); setActive(0) }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title={step === "priority" ? "Change priority" : "Command palette"} aria-describedby={undefined} className={styles.dialog} overlayClassName={styles.overlay}
      onOpenAutoFocus={event => { event.preventDefault(); focus.opened(input.current) }}
      onEscapeKeyDown={event => { if (step === "priority") { event.preventDefault(); setStep("entries"); setQuery(""); setActive(0) } }}
      onCloseAutoFocus={event => { if (focus.closed()) event.preventDefault() }}>
      {/* The entry acts in the same tick as its Enter, so the move's own acknowledgement shows on the next frame. */}
      <PaletteBody {...workspace} input={input} step={step} query={query} active={active} onStep={setStep} onQuery={setQuery} onActive={setActive}
        onRun={() => focus.run(() => onOpenChange(false))} />
    </DialogContent>
  </Dialog>
}

type BodyProps = CommandPaletteWorkspace & {
  input: RefObject<HTMLInputElement | null>
  step: PaletteStep; query: string; active: number
  onStep: (step: PaletteStep) => void; onQuery: (query: string) => void; onActive: (index: number) => void
  /** Closes the palette and returns the element focus went back to. */
  onRun: () => HTMLElement | null
}

/** Mounted only while the palette shows, so the current Request and the Undo pointer are read only then. */
function PaletteBody({ orgId, role, viewer, projects, input, step, query, active, onStep, onQuery, onActive, onRun }: BodyProps) {
  const uid = useId()
  const router = useRouter()
  const list = useRef<HTMLDivElement>(null)
  const current = useCurrentRequest()
  const undo = useUndoableMarkDone()
  const announce = useListAnnouncer()
  const moves = useRequestMoves({ orgId, announce })
  const listContext = useRequestListContext()
  const setListView = useSetRequestListView()
  // useCurrentRequest keeps one object until the Request or its pending changes change.
  const request = current
  const undoId = undo?.requestId
  const entries = useMemo(() => openableEntries(paletteEntries({ role, request, undo: undoId ? { requestId: undoId } : null, projects }), canOpenShellSurface),
    [role, request, undoId, projects])
  // The priority step needs the Request it opened for; if that goes away, the palette is back on its first step.
  const priority = step === "priority" && request ? priorityEntries(request) : null
  const { entries: shown, empty } = filterPaletteEntries<PaletteEntry | PriorityEntry>(priority ?? entries, query)
  const activeIndex = Math.max(0, Math.min(active, shown.length - 1))
  const activeEntry = shown[activeIndex]
  const optionId = (entry: PaletteEntry) => `${uid}-option-${entry.id}`

  // Scroll only the list, so the field never leaves view.
  useEffect(() => {
    const node = list.current, item = node?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    if (!node || !item) return
    if (item.offsetTop < node.scrollTop) node.scrollTop = item.offsetTop
    else if (item.offsetTop + item.offsetHeight > node.scrollTop + node.clientHeight) node.scrollTop = item.offsetTop + item.offsetHeight - node.clientHeight
  }, [activeIndex])

  function goToList(next: Partial<RequestListContext>) {
    // The sidebar's rule: on "/" the list changes in place; elsewhere it navigates there.
    const href = requestListHref(next.status ?? listContext?.status ?? "all", next.project ?? listContext?.project ?? "all")
    setListView(view => withListContext(view, next))
    if (!changesListInPlace(window.location.pathname, href)) router.push(href)
  }

  function back() {
    onStep("entries"); onQuery("")
    onActive(Math.max(0, entries.findIndex(entry => entry.action.kind === "priority")))
  }

  function choose(entry: PaletteEntry) {
    if (entry.action.kind === "priority") {
      if (!request) return
      onStep("priority"); onQuery("")
      onActive(Math.max(0, priorityEntries(request).findIndex(option => option.current)))
      return
    }
    const action = entry.action
    const returnTo = onRun()
    const deps: PaletteActionDeps = {
      request: current, viewer, undo, moves,
      open: surface => { openShellSurface(surface, { returnFocus: returnTo }) },
      view: filter => goToList({ status: filter }),
      project: projectId => goToList({ project: projectId }),
      settings: (section, href) => {
        if (!window.location.pathname.startsWith("/settings/")) { router.push(href); return }
        // Already on Settings: the section changes in place, as from the frame's own sidebar.
        showSettingsSection(section)
        requestAnimationFrame(() => document.getElementById(`settings-${section}`)?.focus({ preventScroll: true }))
      },
      link: id => new URL(`/requests/${id}`, window.location.origin).href,
    }
    runPaletteAction(action, deps)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const command = paletteListKey(event.nativeEvent, { count: shown.length, active: activeIndex, query, step: priority ? "priority" : "entries" })
    if (!command) return
    event.preventDefault()
    if (command.type === "active") onActive(command.index)
    else if (command.type === "back") back()
    else if (activeEntry) choose(activeEntry)
  }

  const listId = `${uid}-list`
  const typed = query.trim()
  const groups = shown.reduce<{ name: string; items: { entry: PaletteEntry | PriorityEntry; index: number }[] }[]>((all, entry, index) => {
    const name = priority ? "Priority" : entry.group
    const last = all.at(-1)
    if (last?.name === name) last.items.push({ entry, index })
    else all.push({ name, items: [{ entry, index }] })
    return all
  }, [])

  return <div className={styles.palette}>
    <SearchField ref={input} label={priority ? "Find a priority" : "Find an action or place"} hideLabel placeholder={priority ? "Find a priority" : "Find an action or place"}
      value={query} onValueChange={value => { onQuery(value); onActive(0) }} onKeyDown={onKeyDown}
      role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={activeEntry ? optionId(activeEntry) : undefined}
      autoComplete="off" spellCheck={false} />
    <div ref={list} id={listId} role="listbox" aria-label={priority ? "Priorities" : "Actions and places"} className={styles.list} hidden={empty}>
      {groups.map(group => <div key={group.name} role="group" aria-labelledby={`${uid}-group-${group.name}`} className={styles.group}>
        <div role="presentation" id={`${uid}-group-${group.name}`} className={styles.heading}>{group.name}</div>
        {group.items.map(({ entry, index }) => <PaletteOption key={entry.id} entry={entry} id={optionId(entry)} index={index} selected={index === activeIndex} onActive={onActive} onChoose={choose} />)}
      </div>)}
    </div>
    {/* Mounted empty, so the first count is heard. The empty state is this same message, shown. */}
    <p role="status" className={empty ? styles.empty : styles.srOnly}>{empty ? "No matches" : typed ? `${shown.length} ${shown.length === 1 ? "result" : "results"}` : ""}</p>
  </div>
}
