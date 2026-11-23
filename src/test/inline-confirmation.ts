import { createElement, type ComponentProps } from "react"
import type { PermanentActionConfirmation as Real } from "@/components/popup/permanent-action-confirmation"

type Props = ComponentProps<typeof Real>

/**
 * A stand-in for `PermanentActionConfirmation` in static-markup tests: Radix renders a dialog's portal only after it
 * mounts in a browser, so the real one shows nothing here. This one renders what an open confirmation shows (its
 * title, description, `children` and the confirm button's label) in place, and keeps the props of every confirmation
 * rendered, so a test can press confirm or close. The real confirm button is always the red one (#263).
 *
 * Use: `vi.mock("@/components/popup/permanent-action-confirmation", () => import("@/test/inline-confirmation"))`.
 */
export function PermanentActionConfirmation(props: Props) {
  rendered.push(props)
  if (!props.open) return null
  return createElement("div", { role: "dialog", "aria-label": props.title, "data-confirmation": "" },
    createElement("h2", null, props.title),
    createElement("p", null, props.description),
    props.children,
    createElement("button", { type: "button", disabled: props.busy || undefined }, "Cancel"),
    createElement("button", { type: "button", "data-confirm": "" }, props.confirmLabel))
}

const rendered: Props[] = []

/** The props of the confirmations rendered since the last `forgetConfirmations`, in render order. */
export function renderedConfirmations(): readonly Props[] {
  return rendered
}

export function forgetConfirmations() {
  rendered.length = 0
}
