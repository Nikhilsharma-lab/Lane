import { LocalTime } from "@/components/requests/local-time";
import { METRIC_UNITS, metricUnitName, type MetricUnit } from "@/lib/metric-definition-rules";
import styles from "./metric-definition-history.module.css";

/** One history entry as the page hands it to the browser. `before`/`after` are the library's snapshots. */
export type MetricHistoryItem = {
  revision: number;
  kind: "created" | "edited" | "archived" | "restored" | "merged_away" | "merged_into";
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  /** Null for a starter metric, which Lane added. */
  authorName: string | null;
  createdAt: string;
};

const KIND: Record<MetricHistoryItem["kind"], string> = {
  created: "Added", edited: "Edited", archived: "Archived", restored: "Restored",
  merged_away: "Merged into another metric", merged_into: "Another metric merged into this one",
};

const FIELDS = [["name", "Name"], ["unit", "Unit"], ["link", "Dashboard link"], ["howCounted", "How it's counted"]] as const;

function shown(field: typeof FIELDS[number][0], value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return field === "unit" && (METRIC_UNITS as readonly string[]).includes(value) ? metricUnitName(value as MetricUnit) : value;
}

type MergeRecord = { keptName: string; mergedName: string };
/** The names a merge recorded (#202); older or unexpected entries fall back to the generic wording. */
function mergeOf(entry: MetricHistoryItem): MergeRecord | null {
  const merge = entry.after.merge as Partial<MergeRecord> | undefined;
  return typeof merge?.keptName === "string" && typeof merge.mergedName === "string" ? { keptName: merge.keptName, mergedName: merge.mergedName } : null;
}

/** The entry's heading: what happened. A merge names the other metric. */
function headline(entry: MetricHistoryItem): string {
  const merge = mergeOf(entry);
  if (merge && entry.kind === "merged_away") return `Merged into ${merge.keptName}`;
  if (merge && entry.kind === "merged_into") return `${merge.mergedName} merged into this one`;
  return KIND[entry.kind];
}

/** What a merge means for Requests, in one line. */
function mergeNote(entry: MetricHistoryItem): string | null {
  const merge = mergeOf(entry);
  if (!merge) return null;
  if (entry.kind === "merged_away") return `Requests that used it count under ${merge.keptName}.`;
  if (entry.kind === "merged_into") return `Requests that used ${merge.mergedName} count under this one.`;
  return null;
}

/** What a change did to each field, in plain words. A creation lists what it was added with. */
function changes(entry: MetricHistoryItem): string[][] {
  return FIELDS.flatMap(([field, label]) => {
    const after = shown(field, entry.after[field]);
    if (!entry.before) return after ? [[`${label}: `, after]] : [];
    const before = shown(field, entry.before[field]);
    if (before === after) return [];
    if (!before) return [[`${label} added: `, after!]];
    if (!after) return [[`${label} removed: `, before]];
    return [[`${label} changed from `, before, " to ", after]];
  });
}

/** A Metric definition's history (#197), newest first: who changed what, when, with the before and after. */
export function MetricDefinitionHistory({ entries }: { entries: MetricHistoryItem[] }) {
  const newestFirst = [...entries].sort((a, b) => b.revision - a.revision);
  return <ol className={styles.history} aria-label="Changes to this metric">
    {newestFirst.map(entry => <li key={entry.revision} className={styles.entry}>
      <p className={styles.heading}>
        <span>{headline(entry)} by {entry.authorName ?? "Lane"}</span>
        <LocalTime iso={entry.createdAt} className={styles.time} time />
      </p>
      {(entry.kind === "created" || entry.kind === "edited") && <ul className={styles.changes}>
        {changes(entry).map(parts => <li key={parts[0]}>{parts.map((part, index) => index % 2 ? <span key={index} className={styles.value}>{part}</span> : part)}</li>)}
      </ul>}
      {mergeNote(entry) && <p className={styles.note}>{mergeNote(entry)}</p>}
    </li>)}
  </ol>;
}
