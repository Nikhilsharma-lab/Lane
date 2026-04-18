import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { requests, designStageEnum } from "./requests";

export const iterations = pgTable("iterations", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id),
  title: text("title").notNull(),
  description: text("description"),
  rationale: text("rationale"),
  figmaUrl: text("figma_url"),
  stage: designStageEnum("stage").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  requestIdIdx: index("iterations_request_id_idx").on(table.requestId),
}));

export const iterationComments = pgTable("iteration_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  iterationId: uuid("iteration_id")
    .notNull()
    .references(() => iterations.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id),
  parentId: uuid("parent_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Iteration = typeof iterations.$inferSelect;
export type NewIteration = typeof iterations.$inferInsert;
export type IterationComment = typeof iterationComments.$inferSelect;
export type NewIterationComment = typeof iterationComments.$inferInsert;
