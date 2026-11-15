import { useRef } from "react"
import { Button } from "@/components/arc/button/button"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import type { JourneyAction } from "@/lib/request-journey"
import type { StepAction, TimelineStep } from "./request-timeline-model"
import styles from "./request-timeline.module.css"

/** #263: a step's action button, where focus goes back when its form closes: the More button for an action in its menu. */
export const actionButton = (action: JourneyAction) =>
  document.querySelector<HTMLElement>(`#journey [data-journey-action="${action}"]`) ?? document.querySelector<HTMLElement>("#journey [data-journey-more]")

/**
 * A Journey step's actions: one filled button at most (the step model's `primary`), each other one plain, and the less
 * common ones behind "More" (#241), Void incorrect release last and set apart. Each one the viewer can take opens its
 * form, Reopen moves the Request back at once, and one they can't says why beside it.
 */
export function JourneyStepActions({ step, headingId, onOpen, onReopen }: {
  step: Pick<TimelineStep, "label" | "actions" | "more">; headingId: string
  onOpen: (action: JourneyAction) => void; onReopen: () => void
}) {
  // An item that opens a form keeps focus there: the menu doesn't take it back to More as it closes.
  const chose = useRef(false)
  const run = (action: StepAction) => action === "reopen" ? onReopen() : onOpen(action)
  if (!step.actions.length && !step.more.length) return null
  return <ul className={styles.actions} aria-label={`${step.label} actions`}>
    {step.actions.map(action => <li key={action.action} className={styles.action}>
      {action.available
        ? <Button variant={action.emphasis} data-journey-action={action.action} onClick={() => run(action.action)}>{action.label}</Button>
        : <><Button variant="secondary" disabled aria-describedby={`${headingId}-${action.action}`}>{action.label}</Button><span id={`${headingId}-${action.action}`} className={styles.muted}>{action.reason}</span></>}
    </li>)}
    {step.more.length > 0 && <li className={styles.action}>
      <DropdownMenu label="More" trigger={<Button variant="secondary" data-journey-more="">More</Button>}
        onCloseAutoFocus={event => { if (chose.current) event.preventDefault(); chose.current = false }}
        items={step.more.map(action => ({
          label: action.label, separatorBefore: action.separated, destructive: action.action === "voidRelease",
          onSelect: () => { chose.current = true; run(action.action) },
        }))} />
    </li>}
  </ul>
}
