import { pgTable, uuid, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { organizations } from "./users";
import { profiles } from "./users";
import { projects } from "./projects";
import { requests } from "./requests";

export const cycleStatusEnum = pgEnum("cycle_status", [
  "draft",
  "active",
  "completed",
  "cancelled",
]);

export const cycles = pgTable("cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: cycleStatusEnum("status").notNull().default("draft"),
  appetiteWeeks: integer("appetite_weeks").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cycleRequests = pgTable("cycle_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  cycleId: uuid("cycle_id")
    .notNull()
    .references(() => cycles.id, { onDelete: "cascade" }),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  addedById: uuid("added_by_id").references(() => profiles.id),
});

export type Cycle = typeof cycles.$inferSelect;
export type NewCycle = typeof cycles.$inferInsert;
export type CycleRequest = typeof cycleRequests.$inferSelect;
export type NewCycleRequest = typeof cycleRequests.$inferInsert;
