"use client"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { JourneyAction } from "@/lib/request-journey"
import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog"
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import { focusWithoutScroll } from "@/components/popup/focus"
import { Placeholder } from "@/components/loading/placeholder"
import { actionButton } from "./journey-step-actions"
import type { FormProps } from "./request-timeline-forms"
import type { TimelineStep } from "./request-timeline-model"
import type { Views } from "./request-timeline"

// The forms, their checks and the date picker load when a Journey popup first opens, or a moment earlier, when the
// pointer or focus reaches one of the Journey's action buttons or its More button.
const formsCode = popupCode(() => import("./journey-popup-forms"))

/** Each Journey popup is titled with its action's name; its final button is the form's own. */
export const JOURNEY_POPUP_TITLES: Record<JourneyAction, string> = {
  release: "Record release",
  correctRelease: "Correct release",
  voidRelease: "Void incorrect release",
  close: "Close Request",
  closeWithoutResult: "Close without a result",
  correctClosure: "Add correction",
  followUp: "Create follow-up Request",
  handover: "Hand over to a new Requester",
}

/**
 * #277: the one Journey popup, on Lane's adaptive popup (#263): centred on desktop, the bottom panel on a phone. Every
 * Journey action opens its form here, while the action is still available on its step. Focus moves to the form's
 * first field and goes back to the action's button on Cancel, Escape or the ×; Escape, the × and a press outside ask
 * "Discard what you typed?" before dropping typed text. After a save, focus goes to the Journey's heading, which the
 * re-read Journey keeps.
 */
export function JourneyStepForm({ mode, steps, views, form }: { mode: JourneyAction | null; steps: Pick<TimelineStep, "actions" | "more">[]; views: Views; form: FormProps }) {
  const open = mode !== null && steps.some(step => [...step.actions, ...step.more].some(action => action.action === mode && action.available))
  // The action shown stays while the popup closes, so its content leaves with it.
  const [shown, setShown] = useState(mode)
  if (open && mode !== shown) setShown(mode)
  // Whether this opening ended in a save. Reset as each opening starts: Radix skips its open-focus event when the form
  // has already taken focus.
  const saved = useRef(false)
  useLayoutEffect(() => { if (open) saved.current = false }, [open])
  useEffect(() => {
    const ahead = (event: Event) => { if (event.target instanceof Element && event.target.closest("#journey :is([data-journey-action], [data-journey-more])")) formsCode.preload() }
    document.addEventListener("pointerover", ahead)
    document.addEventListener("focusin", ahead)
    return () => { document.removeEventListener("pointerover", ahead); document.removeEventListener("focusin", ahead) }
  }, [])
  // Forms that can't load close the popup, as Cancel does, and Lane says so; Try again presses the action again.
  const code = usePopupCode(formsCode, open, () => couldNotOpen("journey", next => { if (!next) form.onCancel() }, { retry: shown ? () => actionButton(shown)?.click() : null }))
  const props: FormProps = { ...form, onSaved: () => { saved.current = true; form.onSaved() } }

  return <Dialog guardTypedText open={open} onOpenChange={next => { if (!next) form.onCancel() }}>
    {shown && <DialogContent title={JOURNEY_POPUP_TITLES[shown]} aria-describedby={undefined} data-journey-popup={shown}
      returnFocus={() => actionButton(shown)}
      onCloseAutoFocus={event => {
        if (!saved.current) return
        // The action's button may be about to go: the saved step moves on once the Journey re-reads.
        event.preventDefault()
        focusWithoutScroll(document.getElementById("journey-heading"))
      }}>
      {code ? <code.JourneyForm key={shown} action={shown} views={views} form={props} /> : <Placeholder label="Loading form" lines={4} />}
    </DialogContent>}
  </Dialog>
}
