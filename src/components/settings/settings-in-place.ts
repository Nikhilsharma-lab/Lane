/**
 * Whether a section at `href` can show in place on the Settings page at `pathname`. Every Settings page
 * carries the Profile-page sections; a section with its own page shows in place only on that page.
 * Its own file, so the offline guard on every page reads it without the Settings catalog.
 */
export function showsSettingsInPlace(href: string, pathname: string): boolean {
  if (!pathname.startsWith("/settings/")) return false;
  const path = href.split("?")[0];
  return path === "/settings/profile" || path === pathname;
}
