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
  /** Null only for a creation Lane made: a starter metric, or a metric moved in from saved Requests (0038). */
  authorId: text("author_id").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.definitionId, t.revision),
  foreignKey({ columns: [t.orgId, t.definitionId], foreignColumns: [metricDefinitions.orgId, metricDefinitions.id] }).onDelete("cascade"),
  index("metric_definition_history_definition_idx").on(t.orgId, t.definitionId, t.revision),
  index("metric_definition_history_author_idx").on(t.authorId),
]);

/**
 * What each metric saved on an older Request stands for (migration 0038): a built-in key, or a typed name, with its
 * unit, mapped to a definition. Saved Requests are never rewritten; the library resolves them through this mapping.
 * `typedName` and `unit` are stored as public.metric_alias_name() / metric_alias_unit() compare them. Rows are never edited.
 */
export const metricDefinitionAliases = pgTable("metric_definition_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  definitionId: uuid("definition_id").notNull(),
  builtinKey: text("builtin_key").$type<StarterMetricKey>(),
  typedName: text("typed_name"),
  unit: text("unit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  foreignKey({ columns: [t.orgId, t.definitionId], foreignColumns: [metricDefinitions.orgId, metricDefinitions.id] }).onDelete("cascade"),
  uniqueIndex("metric_definition_aliases_builtin_unique").on(t.orgId, t.builtinKey, t.unit).where(sql`${t.builtinKey} is not null`),
  uniqueIndex("metric_definition_aliases_typed_unique").on(t.orgId, t.typedName, t.unit).where(sql`${t.typedName} is not null`),
  index("metric_definition_aliases_definition_idx").on(t.orgId, t.definitionId),
  check("metric_definition_aliases_source_check", sql`(${t.builtinKey} is null) <> (${t.typedName} is null)`),
  check("metric_definition_aliases_builtin_check", sql`${t.builtinKey} is null or ${t.builtinKey} in ('conversion', 'adoption', 'error', 'support', 'csat', 'duration', 'events')`),
  check("metric_definition_aliases_typed_check", sql`${t.typedName} is null or (${t.typedName} <> '' and ${t.typedName} = public.metric_alias_name(${t.typedName}))`),
  check("metric_definition_aliases_unit_check", sql`${t.unit} <> '' and ${t.unit} = public.metric_alias_unit(${t.unit})`),
]);
