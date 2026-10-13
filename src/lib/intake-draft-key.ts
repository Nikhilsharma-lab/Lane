/**
 * Where this tab keeps its Intake draft, and whether one is there. No schema
 * library: the composer provider checks for a draft on every route, so this
 * module must stay small. The composer validates and restores the draft itself
 * (intake-draft.ts) once it opens.
 */
export const INTAKE_DRAFT_VERSION = 2;
export const INTAKE_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const INTAKE_DRAFT_CLOCK_SKEW_MS = 60 * 1000;

export function intakeDraftScope(userId: string, orgId: string): string {
  return `${userId}:${orgId}`;
}

export function intakeDraftStorageKey(scope: string): string {
  return `lane:intake-draft:v${INTAKE_DRAFT_VERSION}:${scope}`;
}

/** A current draft of this version for the scope, without parsing its fields. Never throws. */
export function hasIntakeDraft(
  storage: Pick<Storage, "getItem">,
  scope: string,
  now = Date.now()
): boolean {
  try {
    const raw = storage.getItem(intakeDraftStorageKey(scope));
    if (!raw) return false;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return false;
    const { version, savedAt } = value as { version?: unknown; savedAt?: unknown };
    return (
      version === INTAKE_DRAFT_VERSION &&
      typeof savedAt === "number" &&
      now - savedAt <= INTAKE_DRAFT_MAX_AGE_MS &&
      savedAt - now <= INTAKE_DRAFT_CLOCK_SKEW_MS
    );
  } catch {
    return false;
  }
}
