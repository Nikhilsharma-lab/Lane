/**
 * Published-view access checks.
 *
 * `authenticated` access mode requires that the viewer belong to the same
 * org as the view. Without this, any logged-in user who obtained an
 * authenticated view ID could read another org's request data.
 */
export function canAccessAuthenticatedView(
  viewOrgId: string,
  userProfileOrgId: string | null | undefined
): boolean {
  if (!userProfileOrgId) return false;
  return userProfileOrgId === viewOrgId;
}
