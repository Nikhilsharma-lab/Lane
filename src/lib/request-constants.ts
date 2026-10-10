// Request constants and labels with no Zod import (plan item 1.13). Client
// components that only need these values import this module so the Zod
// chunk stays out of their bundle; the schemas live in request-properties.ts.
export const REQUEST_TYPES = ["bug", "improvement", "new_feature"] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];
export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  bug: "Bug",
  improvement: "Improvement",
  new_feature: "New feature",
};
export const REQUEST_TYPE_DESCRIPTIONS: Record<RequestType, string> = {
  bug: "Something fails to behave as expected.",
  improvement: "An existing capability or experience needs to work better.",
  new_feature: "A capability that does not currently exist.",
};
export const REQUEST_PRIORITIES = ["none", "urgent", "high", "medium", "low"] as const;
export type RequestPriority = (typeof REQUEST_PRIORITIES)[number];
export const REQUEST_PRIORITY_LABELS: Record<RequestPriority, string> = {
  none: "No priority",
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};
export type ProjectOption = { id: string; name: string; description: string | null };

// Zod's RFC 9562 UUID pattern, the one projectIdSchema applies. Client code
// that only reads a ?project= value uses projectIdOrNull so it does not pull
// Zod into the bundle; server input still goes through projectIdSchema.
const PROJECT_ID_PATTERN = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

/** The Project id projectIdSchema would accept, or null where it would fail or default. */
export function projectIdOrNull(value: unknown): string | null {
  return typeof value === "string" && PROJECT_ID_PATTERN.test(value) ? value : null;
}
