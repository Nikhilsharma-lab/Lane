import { pgTable, uuid, timestamp, jsonb, text, unique } from "drizzle-orm/pg-core";
import { organizations } from "./users";

export const weeklyDigests = pgTable(
  "weekly_digests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // ISO YYYY-MM-DD of the Monday of the digest's week. Historical archive key.
    weekStartDate: text("week_start_date").notNull().default(""),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    content: jsonb("content").notNull(),
  },
  (table) => ({
    orgWeekUniq: unique().on(table.orgId, table.weekStartDate),
  }),
);

export type WeeklyDigestRow = typeof weeklyDigests.$inferSelect;
