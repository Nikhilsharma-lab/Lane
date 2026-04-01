import { pgTable, uuid, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { requests } from "./requests";

export const impactRecords = pgTable("impact_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),
  pmId: uuid("pm_id")
    .notNull()
    .references(() => profiles.id),

  // What was predicted
  predictedMetric: text("predicted_metric").notNull(), // e.g. "checkout conversion"
  predictedValue: text("predicted_value").notNull(),   // e.g. "+5%"

  // What actually happened
  actualValue: text("actual_value"),

  // Calculated variance: ((actual - predicted) / predicted) * 100
  // Positive = over-delivered, Negative = under-delivered
  variancePercent: numeric("variance_percent"),

  notes: text("notes"),
  measuredAt: timestamp("measured_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImpactRecord = typeof impactRecords.$inferSelect;
export type NewImpactRecord = typeof impactRecords.$inferInsert;
