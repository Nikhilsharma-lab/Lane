/**
 * #263: how page-level Escape handlers reach an open in-page form (in-page-form.tsx) without loading it.
 * `dismissOpenForm` asks the open form inside `scope` (the one holding focus, else the last) to close, as Escape
 * does, and returns true so the page does nothing else with this Escape.
 */
export const DISMISS_FORM = "lane:dismiss-form"

export function dismissOpenForm(scope: ParentNode = document) {
  const forms = Array.from(scope.querySelectorAll("[data-detail-form]"))
  const form = forms.find(element => element.contains(document.activeElement)) ?? forms.at(-1)
  if (!form) return false
  form.dispatchEvent(new Event(DISMISS_FORM))
  return true
}
