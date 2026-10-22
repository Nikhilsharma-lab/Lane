/** The event the Settings frame follows, besides popstate, to show the section in the URL. */
export const SETTINGS_SECTION_EVENT = "lane-settings-navigation"

/**
 * Shows a Settings section in place, as the frame's own sidebar and search do and as the ⌘K palette does
 * when already on Settings: the URL takes the section (a history entry, so Back returns) and the frame follows.
 */
export function showSettingsSection(id: string) {
  const url = new URL(window.location.href)
  url.searchParams.set("section", id)
  url.hash = ""
  window.history.pushState(null, "", url)
  window.dispatchEvent(new Event(SETTINGS_SECTION_EVENT))
}
