// db/schema/prediction_confidence.ts
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { requests } from "./requests";

export const predictionConfidence = pgTable("prediction_confidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  label: text("label").notNull(),     // realistic | optimistic | vague | unmeasurable
  rationale: text("rationale").notNull(),
  redFlags: jsonb("red_flags").$type<string[]>().notNull().default([]),
  suggestion: text("suggestion"),
  aiModel: text("ai_model").notNull(),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PredictionConfidence = typeof predictionConfidence.$inferSelect;
export type NewPredictionConfidence = typeof predictionConfidence.$inferInsert;
