import type { RequestType } from "./request-constants";
// Plain label rules, safe for any page's browser code. The form and action schemas are in
// request-label-schemas.ts, so the form-checking library stays out of pages without a form (#266).
export const LABEL_COLOURS = ["red", "blue", "green", "yellow", "purple", "grey"] as const;
export type LabelColour = typeof LABEL_COLOURS[number];
export type RequestLabel = { id: string; name: string; colour: LabelColour; projectId?: string | null };
export const DEFAULT_LABELS: RequestLabel[] = [
  { id: "bug", name: "Bug", colour: "red" },
  { id: "improvement", name: "Improvement", colour: "blue" },
  { id: "new_feature", name: "New feature", colour: "green" },
];
export function requestLabelKeys(request: { labelKeys?: string[] | null; requestType?: RequestType | null }): string[] {
  return request.labelKeys ?? (request.requestType ? [request.requestType] : []);
}
/** The Request type a Request's source states: its labels' when it has them, otherwise its own type. */
export function sourceRequestType(source: { labelKeys?: string[] | null; requestType?: RequestType | null }): RequestType | null {
  return source.labelKeys ? labelRequestType(source.labelKeys) : source.requestType ?? null;
}
/** Compatibility value for the existing measurement gate; labels remain authoritative. */
export function labelRequestType(keys: string[]): RequestType | null {
  return keys.includes("new_feature") ? "new_feature" : keys.includes("bug") ? "bug" : keys.includes("improvement") ? "improvement" : null;
}
