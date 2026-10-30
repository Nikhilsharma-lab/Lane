/**
 * #263: has the person typed something here that closing would lose?
 *
 * One document listener notes each text field's value just before the person first changes it
 * (`beforeinput` fires for typing, pasting, dropping and deleting, never for a value the code sets).
 * A field counts as typed in while its value differs from that first value, so typing and then
 * clearing it again, or a prefilled name left as it was, asks nothing. The unsaved-text guard
 * (`unsaved-text-guard.tsx`), the adaptive popup (`adaptive-dialog.tsx`) and the in-page form
 * (`in-page-form.tsx`) read it through `hasTypedText`. They load with the page, so the listener is
 * there before anyone types.
 */

/** The fields a person types text into. `focus.ts` starts a popup on the first of them, too. */
export const TEXT_FIELDS = "textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=color])"

type Field = HTMLInputElement | HTMLTextAreaElement
const before = new WeakMap<Field, string>()

function isField(target: EventTarget | null): target is Field {
  return (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && target.matches(TEXT_FIELDS)
}

if (typeof document !== "undefined") {
  document.addEventListener("beforeinput", event => {
    if (isField(event.target) && !before.has(event.target)) before.set(event.target, event.target.value)
  }, true)
}

/** True when a text field inside `container` holds text the person typed and hasn't saved. */
export function hasTypedText(container: Element | null | undefined) {
  if (!container) return false
  return Array.from(container.querySelectorAll<Field>(TEXT_FIELDS)).some(field => {
    const first = before.get(field)
    return first !== undefined && field.value !== first && field.value.trim() !== ""
  })
}
