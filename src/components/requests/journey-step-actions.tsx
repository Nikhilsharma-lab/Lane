import { Button } from "@/components/arc/button/button"
import type { JourneyAction } from "@/lib/request-journey"
import type { TimelineStep } from "./request-timeline-model"
import styles from "./request-timeline.module.css"

/** #263: a step's action button, where focus goes back when its form closes. */
export const actionButton = (action: JourneyAction) => document.querySelector<HTMLElement>(`#journey [data-journey-action="${action}"]`)

/** A Journey step's actions: each one the viewer can take opens its form; one they can't says why beside it. */
export function JourneyStepActions({ step, headingId, onOpen }: { step: Pick<TimelineStep, "label" | "actions">; headingId: string; onOpen: (action: JourneyAction) => void }) {
  if (!step.actions.length) return null
  return <ul className={styles.actions} aria-label={`${step.label} actions`}>
    {step.actions.map((action, index) => <li key={action.action} className={styles.action}>
      {action.available
        ? <Button variant={index === 0 ? "primary" : "secondary"} data-journey-action={action.action} onClick={() => onOpen(action.action)}>{action.label}</Button>
        : <><Button variant="secondary" disabled aria-describedby={`${headingId}-${action.action}`}>{action.label}</Button><span id={`${headingId}-${action.action}`} className={styles.muted}>{action.reason}</span></>}
    </li>)}
  </ul>
}
