import { useEffect } from "react"

/**
 * #277: Escape inside an open Arc date picker closes only its calendar, never the popup around it, and asks nothing.
 * Radix hears Escape on the document before the picker does, so this listens on the window, which hears it first:
 * with a calendar open it stops Escape there and closes that calendar through its own button, which hands focus back
 * to it. Lives with the forms that hold a picker, so no page's first load carries it.
 */
const OPEN_PICKER = '[aria-haspopup="dialog"][aria-expanded="true"]'

export function useEscapeClosesPickerFirst() {
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !(event.target instanceof Element)) return
      const trigger = event.target.closest(`${OPEN_PICKER}, ${OPEN_PICKER} + [role="dialog"]`)
      const button = trigger?.matches(OPEN_PICKER) ? trigger : trigger?.previousElementSibling
      if (!(button instanceof HTMLElement)) return
      event.stopPropagation()
      event.preventDefault()
      button.click()
    }
    window.addEventListener("keydown", escape, true)
    return () => window.removeEventListener("keydown", escape, true)
  }, [])
}
