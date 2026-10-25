import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { organizations, profiles } from "./users";
import type { MetricUnit, StarterMetricKey } from "@/lib/metric-definition-rules";

/**
 * The Metrics library (migration 0037). Read and written only by src/lib/metrics-library.ts;
 * every other part of Lane goes through that module.
 */
export const metricDefinitions = pgTable("metric_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  unit: text("unit").$type<MetricUnit>().notNull(),
  link: text("link"),
  howCounted: text("how_counted"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  mergedIntoId: uuid("merged_into_id"),
  /** Set only on the seven starter metrics Lane adds; one row per key per workspace. */
  starterKey: text("starter_key").$type<StarterMetricKey>(),
  /** Null only for a starter metric. */
  createdBy: text("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("metric_definitions_org_id_id_unique").on(t.orgId, t.id),
  foreignKey({ name: "metric_definitions_merged_into_fk", columns: [t.orgId, t.mergedIntoId], foreignColumns: [t.orgId, t.id] as [AnyPgColumn, AnyPgColumn] }),
  uniqueIndex("metric_definitions_active_name_unique").on(t.orgId, sql`lower(${t.name})`).where(sql`${t.archivedAt} is null and ${t.mergedIntoId} is null`),
  uniqueIndex("metric_definitions_starter_unique").on(t.orgId, t.starterKey).where(sql`${t.starterKey} is not null`),
  index("metric_definitions_merged_into_idx").on(t.orgId, t.mergedIntoId).where(sql`${t.mergedIntoId} is not null`),
  index("metric_definitions_created_by_idx").on(t.createdBy),
  check("metric_definitions_name_check", sql`char_length(${t.name}) between 1 and 120 and ${t.name} = btrim(${t.name})`),
  check("metric_definitions_unit_check", sql`${t.unit} in ('percent', 'count', 'seconds', 'minutes')`),
  check("metric_definitions_link_check", sql`${t.link} is null or (char_length(${t.link}) <= 2048 and ${t.link} ~* '^https?://[^[:space:]]+$')`),
  check("metric_definitions_how_counted_check", sql`${t.howCounted} is null or (char_length(${t.howCounted}) between 1 and 500 and btrim(${t.howCounted}) <> '')`),
  check("metric_definitions_starter_key_check", sql`${t.starterKey} is null or ${t.starterKey} in ('conversion', 'adoption', 'error', 'support', 'csat', 'duration', 'events')`),
  check("metric_definitions_created_by_check", sql`${t.createdBy} is not null or ${t.starterKey} is not null`),
  check("metric_definitions_merged_into_check", sql`${t.mergedIntoId} is distinct from ${t.id}`),
]);

export type MetricDefinitionHistoryKind = "created" | "edited" | "archived" | "restored" | "merged_away" | "merged_into";

/** Append-only history of definition changes. Rows are never edited (database rule, migration 0037). */
export const metricDefinitionHistory = pgTable("metric_definition_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull(),
  definitionId: uuid("definition_id").notNull(),
  revision: integer("revision").notNull(),
  kind: text("kind").$type<MetricDefinitionHistoryKind>().notNull(),
  /** Null only for a creation. */
  before: jsonb("before").$type<Record<string, unknown>>(),
  after: jsonb("after").$type<Record<string, unknown>>().notNull(),
  /** Null only for a starter metric's creation. */
  authorId: text("author_id").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.definitionId, t.revision),
  foreignKey({ columns: [t.orgId, t.definitionId], foreignColumns: [metricDefinitions.orgId, metricDefinitions.id] }).onDelete("cascade"),
  index("metric_definition_history_definition_idx").on(t.orgId, t.definitionId, t.revision),
  index("metric_definition_history_author_idx").on(t.authorId),
]);
