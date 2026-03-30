import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { requests, stageEnum } from "./requests";

export const assignmentRoleEnum = pgEnum("assignment_role", [
  "lead",
  "reviewer",
  "contributor",
]);

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  assigneeId: uuid("assignee_id")
    .notNull()
    .references(() => profiles.id),
  assignedById: uuid("assigned_by_id").references(() => profiles.id),
  role: assignmentRoleEnum("role").notNull().default("lead"),
  notes: text("notes"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
});

export const requestStages = pgTable("request_stages", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  stage: stageEnum("stage").notNull(),
  enteredAt: timestamp("entered_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedById: uuid("completed_by_id").references(() => profiles.id),
  notes: text("notes"),
});

export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type RequestStage = typeof requestStages.$inferSelect;
export type NewRequestStage = typeof requestStages.$inferInsert;
