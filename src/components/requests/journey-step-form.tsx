import { useRouter } from "next/navigation"
import type { JourneyAction } from "@/lib/request-journey"
import { InPageForm } from "@/components/popup/in-page-form"
import { ReleaseForm } from "./release-form"
import { ClosureCorrectionForm, CloseWithoutResultForm, FollowUpForm, HandoverForm, MeasuredCloseForm, VoidReleaseForm, type FormProps } from "./request-timeline-forms"
import { actionButton } from "./journey-step-actions"
import type { Views } from "./request-timeline"

/** The open action's form, inline under its step (#263): focus moves in, Escape asks before discarding, and focus goes
 * back to the action's button when it closes. */
export function JourneyStepForm({ mode, views: { release, outcome }, form }: { mode: JourneyAction; views: Views; form: FormProps }) {
  const router = useRouter()
  const closure = outcome.closure
  const agreed = outcome.agreed

  function stepForm(action: JourneyAction) {
    switch (action) {
      case "release": return <ReleaseForm {...form} audience={release.audience} earliestExposure={release.earliestExposure} today={release.today} valueBefore={release.valueBefore} />
      case "correctRelease": return release.release && <ReleaseForm {...form} audience={release.audience} earliestExposure={release.earliestExposure} today={release.today} valueBefore={release.valueBefore} correcting={{ ...release.release, valueBefore: release.recordedValueBefore }} />
      case "voidRelease": return <VoidReleaseForm {...form} />
      case "close": return agreed && <MeasuredCloseForm {...form} agreed={agreed} release={release.release} />
      case "closeWithoutResult": return <CloseWithoutResultForm {...form} />
      case "correctClosure": return closure && <ClosureCorrectionForm {...form} closureKind={closure.kind} result={closure.kind === "measured" ? closure.primary.kind === "numeric" ? { kind: "numeric", unit: closure.primary.unit } : { kind: "pass_fail" } : null} />
      case "followUp": return <FollowUpForm {...form} onCreated={id => router.push(`/requests/${id}`)} />
      case "handover": return <HandoverForm {...form} people={release.people} />
    }
  }

  return <InPageForm onDismiss={form.onCancel} returnFocus={() => actionButton(mode)}>{stepForm(mode)}</InPageForm>
}
