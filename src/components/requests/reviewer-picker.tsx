"use client"

import { useEffect, useRef, useState } from "react"
import { Plus, X } from "lucide-react"
import { Alert } from "@/components/arc/alert/alert"
import { Button } from "@/components/arc/button/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/arc/popover/popover"
import { SearchField } from "@/components/arc/search-field/search-field"
import type { ReviewPerson } from "@/lib/request-review"
import { PickerOptions, focusOnOpen, pickerPopoverProps, searchListKeyDown } from "./request-property-pickers"
import { REVIEWER_DEBOUNCE_MS, ROSTER_TRUNCATED, filterRoster, mergeOptions, nameMatches, normalizeQuery, pickerStatus } from "./reviewer-search"
import styles from "./design-review-panel.module.css"

export { REVIEWER_DEBOUNCE_MS, filterRoster, mergeOptions } from "./reviewer-search"

/** The GET route caps the query at REVIEWER_QUERY_MAX (src/lib/data/reviewers.ts); the field matches it. */
const QUERY_MAX = 100
const LOAD_FAILED = "Teammates could not be loaded. Try again."

export type FindReviewers = (query: string, signal?: AbortSignal) => Promise<{ members: ReviewPerson[] } | { error: string }>

/**
 * Plan item 2.6: the reviewer type-ahead, on the Project picker's shell. One
 * request per open fetches the roster (q=""); typing then filters it locally,
 * so the options are on screen in the same frame. Only a truncated roster (over
 * 100 eligible people) or a failed load takes the debounced server path, where
 * a new keystroke aborts the fetch in flight and a result for an older query is
 * dropped: the latest query wins and requests never stack. The selected rows
 * outside the popover are the durable record.
 */
export function ReviewerPicker({ selected, onChange, limit, excludeId, onFindReviewers, disabled = false }: {
  selected: ReviewPerson[]; onChange: (next: ReviewPerson[]) => void; limit: number; excludeId: string
  onFindReviewers: FindReviewers; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [roster, setRoster] = useState<ReviewPerson[] | "truncated" | null>(null)
  const [results, setResults] = useState<ReviewPerson[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The server asked for a more specific name (the roster, or this query, matches over 100 people).
  const [narrow, setNarrow] = useState(false)
  const sequence = useRef(0)
  const inflight = useRef<AbortController | null>(null)
  const debounce = useRef(0)
  const lastQuery = useRef("")
  const alive = useRef(true)
  const searchRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])
  const removeRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; window.clearTimeout(debounce.current); inflight.current?.abort() }
  }, [])

  const local = Array.isArray(roster)
  const normalized = normalizeQuery(query)
  const matches = (local ? filterRoster(roster, query) : results).filter(person => person.id !== excludeId)
  const options = mergeOptions(selected, matches)
  const full = selected.length >= limit
  const isSelected = (person: ReviewPerson) => selected.some(member => member.id === person.id)

  async function search(value: string) {
    window.clearTimeout(debounce.current); debounce.current = 0
    const trimmed = value.trim()
    lastQuery.current = value
    const id = ++sequence.current
    // A newer query replaces an older one in flight instead of waiting for it.
    const controller = new AbortController()
    inflight.current?.abort(); inflight.current = controller
    setSearching(true); setError(null)
    try {
      const result = await onFindReviewers(trimmed, controller.signal)
      if (!alive.current || sequence.current !== id) return
      if ("members" in result) {
        if (trimmed === "") setRoster(result.members)
        setResults(result.members); setNarrow(false)
      } else if (ROSTER_TRUNCATED.test(result.error)) {
        if (trimmed === "") setRoster("truncated")
        setResults([]); setNarrow(true)
      } else { setError(result.error); setNarrow(false) }
    } catch (thrown) {
      if (!alive.current || sequence.current !== id) return
      if (thrown instanceof DOMException && thrown.name === "AbortError") return
      setError(LOAD_FAILED)
    } finally {
      if (alive.current && sequence.current === id) setSearching(false)
    }
  }
  function onQueryChange(value: string) {
    setQuery(value)
    if (local) return
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => { debounce.current = 0; if (alive.current) void search(value) }, REVIEWER_DEBOUNCE_MS)
  }
  /** Enter with a search still waiting on the debounce runs it at once. */
  function flush() {
    if (!debounce.current) return false
    void search(query)
    return true
  }
  function toggle(person: ReviewPerson) {
    if (isSelected(person)) onChange(selected.filter(member => member.id !== person.id))
    else if (!full) onChange([...selected, person])
  }
  function remove(index: number) {
    const target = (index > 0 ? removeRefs.current[index - 1] : null) ?? triggerRef.current
    onChange(selected.filter((_, position) => position !== index))
    requestAnimationFrame(() => target?.focus())
  }
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) { setQuery(""); setError(null); setNarrow(false); void search("") }
    else { window.clearTimeout(debounce.current); debounce.current = 0; inflight.current?.abort(); setQuery(""); setSearching(false) }
  }
  const status = pickerStatus({ searching, error, full, limit, narrow, local, normalized, matches: matches.length })

  return <>
    {selected.length > 0 && <ul aria-label="Selected reviewers" className={styles.selectedReviewers}>{selected.map((person, index) => <li key={person.id} className={styles.selectedReviewer}>
      <span>{person.name}</span>
      <Button ref={element => { removeRefs.current[index] = element }} type="button" variant="ghost" size="sm" morph="plain" aria-label={`Remove ${person.name}`} disabled={disabled} onClick={() => remove(index)}><X size={16} aria-hidden="true" /></Button>
    </li>)}</ul>}
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button ref={triggerRef} type="button" variant="secondary" size="sm" disabled={disabled}><Plus size={16} aria-hidden="true" />Add reviewers</Button>
      </PopoverTrigger>
      <PopoverContent {...pickerPopoverProps} aria-label="Choose reviewers" onOpenAutoFocus={event => focusOnOpen(event, searchRef)} className="space-y-3">
        <SearchField ref={searchRef} label="Teammates" aria-label="Search teammates" placeholder="Type a name" maxLength={QUERY_MAX} value={query} onValueChange={onQueryChange}
          onKeyDown={event => {
            if (event.key !== "Enter") { searchListKeyDown(event, options, optionRefs, toggle); return }
            if (event.nativeEvent.isComposing) return
            event.preventDefault()
            if (flush()) return
            // "Type a prefix, Enter" picks the first row that matches the query.
            const first = normalized ? options.find(person => nameMatches(person.name, normalized)) : options[0]
            if (first) toggle(first)
          }} />
        <PickerOptions items={options} label="Teammates" optionRefs={optionRefs} searchRef={searchRef} keyOf={person => person.id}
          isSelected={isSelected} isInert={person => full && !isSelected(person)} render={person => person.name} onChoose={toggle}
          disabled={disabled} busy={searching} multiselectable />
        {status && <p role="status" className={styles.hint}>{status}</p>}
        {error && <>
          <Alert tone="danger" title="Could not load teammates">{error}</Alert>
          <Button type="button" variant="secondary" size="sm" onClick={() => { void search(lastQuery.current) }}>Retry</Button>
        </>}
      </PopoverContent>
    </Popover>
  </>
}
