// db/schema/handoff_briefs.ts
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { requests } from "./requests";

export const requestHandoffBriefs = pgTable("request_handoff_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),

  designDecisions: jsonb("design_decisions")
    .$type<{ decision: string; rationale: string }[]>()
    .notNull()
    .default([]),
  openQuestions: jsonb("open_questions")
    .$type<string[]>()
    .notNull()
    .default([]),
  buildSequence: jsonb("build_sequence")
    .$type<string[]>()
    .notNull()
    .default([]),
  figmaNotes: text("figma_notes").notNull().default(""),
  edgeCases: jsonb("edge_cases")
    .$type<string[]>()
    .notNull()
    .default([]),
  accessibilityGaps: jsonb("accessibility_gaps")
    .$type<string[]>()
    .notNull()
    .default([]),

  aiModel: text("ai_model").notNull(),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RequestHandoffBrief = typeof requestHandoffBriefs.$inferSelect;
export type NewRequestHandoffBrief = typeof requestHandoffBriefs.$inferInsert;
