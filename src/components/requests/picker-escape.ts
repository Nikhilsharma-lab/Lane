/**
 * #277: Escape inside a popup's open date picker closes only the calendar. Radix hears Escape on the document first,
 * ahead of the picker's own handler, so a popup that holds an Arc date picker passes this as `onEscapeKeyDown`: while
 * the calendar is open the popup stays, and nothing asks "Discard what you typed?". The picker then closes itself.
 */
const OPEN_PICKER = '[aria-haspopup="dialog"][aria-expanded="true"]'

export function keepOpenWhilePickerOpen(event: KeyboardEvent) {
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest(`${OPEN_PICKER}, ${OPEN_PICKER} + [role="dialog"]`)) event.preventDefault()
}
