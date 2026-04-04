// db/schema/impact_retrospectives.ts
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { requests } from "./requests";

export const impactRetrospectives = pgTable("impact_retrospectives", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),
  headline: text("headline").notNull(),
  whatHappened: text("what_happened").notNull(),
  likelyReasons: jsonb("likely_reasons").$type<string[]>().notNull().default([]),
  nextTimeSuggestion: text("next_time_suggestion").notNull(),
  celebrate: text("celebrate"),
  aiModel: text("ai_model"),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImpactRetrospective = typeof impactRetrospectives.$inferSelect;
export type NewImpactRetrospective = typeof impactRetrospectives.$inferInsert;
