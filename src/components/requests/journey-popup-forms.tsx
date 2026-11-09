"use client"
import { useRouter } from "next/navigation"
import type { JourneyAction } from "@/lib/request-journey"
import { ReleaseForm } from "./release-form"
import { ClosureCorrectionForm, CloseWithoutResultForm, FollowUpForm, HandoverForm, MeasuredCloseForm, VoidReleaseForm, type FormProps } from "./request-timeline-forms"
import type { Views } from "./request-timeline"
import { FocusOnArrival } from "./focus-on-arrival"

// The release date picker takes Escape for itself while open; the popup reads this with its forms.
export { keepOpenWhilePickerOpen } from "./picker-escape"

/**
 * #277: what a Journey popup holds, loaded the first time one opens (journey-step-form.tsx), so the forms, their
 * checks and the date picker stay out of the Request page's first load. Each form keeps its own server call and ends
 * in its own named button.
 */
export function JourneyForm({ action, views: { release, outcome }, form }: { action: JourneyAction; views: Views; form: FormProps }) {
  const router = useRouter()
  const { closure, agreed } = outcome
  const body = (() => {
    switch (action) {
      case "release": return <ReleaseForm {...form} read={release} />
      case "correctRelease": return release.release && <ReleaseForm {...form} read={release} correcting />
      case "voidRelease": return <VoidReleaseForm {...form} />
      case "close": return agreed && <MeasuredCloseForm {...form} agreed={agreed} release={release.release} />
      case "closeWithoutResult": return <CloseWithoutResultForm {...form} />
      case "correctClosure": return closure && <ClosureCorrectionForm {...form} closureKind={closure.kind} result={closure.kind === "measured" ? closure.primary.kind === "numeric" ? { kind: "numeric", unit: closure.primary.unit } : { kind: "pass_fail" } : null} />
      case "followUp": return <FollowUpForm {...form} onCreated={id => router.push(`/requests/${id}`)} />
      case "handover": return <HandoverForm {...form} people={release.people} />
    }
  })()
  // The popup may have opened before this code arrived, so it couldn't focus a field yet.
  return <FocusOnArrival>{body}</FocusOnArrival>
}
