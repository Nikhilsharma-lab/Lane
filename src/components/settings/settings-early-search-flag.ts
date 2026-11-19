/**
 * #288 (D20): what Settings' early "/" listener (settings-early-search.tsx) leaves on `window` before the page's code
 * runs: true once "/" was pressed, null once Settings listens for it itself.
 */
export const EARLY_SEARCH = "__laneSettingsSearch";

/** Whether "/" was pressed before Settings listened, and from now on leaves "/" to Settings' own listener. */
export function takeEarlySearch(): boolean {
  const flags = window as unknown as Record<string, boolean | null | undefined>;
  const pressed = flags[EARLY_SEARCH] === true;
  flags[EARLY_SEARCH] = null;
  return pressed;
}
