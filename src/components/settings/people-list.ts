import { SETTINGS_SECTION_EVENT, settingsHref, showSettingsSection } from "./settings-catalog"

/** The People group's id in Settings → Members. It takes focus (`tabIndex={-1}`), so a link can land on it. */
export const PEOPLE_LIST = "people"

/** Where the People list opens from anywhere, such as a new tab. */
export const PEOPLE_LIST_HREF = `${settingsHref("members")}#${PEOPLE_LIST}`

/** Shows Members in place on any Settings page and asks for focus on its People list, which may load only now. */
export function showPeopleList() {
  showSettingsSection("members", PEOPLE_LIST)
}

/** Focuses the People list when the address asks for it. */
export function focusAskedPeopleList() {
  if (window.location.hash === `#${PEOPLE_LIST}`) document.getElementById(PEOPLE_LIST)?.focus()
}

/** The mounted People list's effect: takes focus if it was asked for while loading, and whenever it's asked for later. */
export function followPeopleList() {
  focusAskedPeopleList()
  // The frame shows Members on the same event; a hidden list can't take focus, so wait for that.
  const asked = () => { requestAnimationFrame(focusAskedPeopleList) }
  window.addEventListener(SETTINGS_SECTION_EVENT, asked)
  return () => window.removeEventListener(SETTINGS_SECTION_EVENT, asked)
}
