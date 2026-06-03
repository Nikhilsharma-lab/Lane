import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { organizations, profiles } from "./users";

export const classificationEnum = pgEnum("classification", [
  "problem",
  "solution",
  "hybrid",
]);

export const requestStatusEnum = pgEnum("request_status", [
  "open",
  "in_progress",
  "done",
]);

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    classification: classificationEnum("classification"),
    reframedProblem: text("reframed_problem"),
    extractedSolution: text("extracted_solution"),
    status: requestStatusEnum("status").notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => profiles.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orgIdIdx: index("requests_org_id_idx").on(table.orgId),
    createdByIdx: index("requests_created_by_idx").on(table.createdBy),
  })
);

export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
