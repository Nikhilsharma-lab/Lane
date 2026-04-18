import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { requests } from "./requests";
import { profiles } from "./users";

export const decisionLogEntries = pgTable("decision_log_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id),
  title: text("title").notNull(),
  entryType: text("entry_type", { enum: ["chosen", "killed"] }).notNull(),
  rationale: text("rationale"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  requestIdIdx: index("decision_log_entries_request_id_idx").on(table.requestId),
}));

export type DecisionLogEntry = typeof decisionLogEntries.$inferSelect;
export type NewDecisionLogEntry = typeof decisionLogEntries.$inferInsert;
