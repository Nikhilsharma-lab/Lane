import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { organizations } from "./users";
import { profiles } from "./users";
import { requests } from "./requests";

export const initiativeStatusEnum = pgEnum("initiative_status", [
  "active",
  "completed",
  "archived",
]);

export const initiatives = pgTable("initiatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#2E5339"),
  status: initiativeStatusEnum("status").notNull().default("active"),
  createdById: uuid("created_by_id").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const initiativeRequests = pgTable("initiative_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  initiativeId: uuid("initiative_id")
    .notNull()
    .references(() => initiatives.id, { onDelete: "cascade" }),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Initiative = typeof initiatives.$inferSelect;
export type NewInitiative = typeof initiatives.$inferInsert;
export type InitiativeRequest = typeof initiativeRequests.$inferSelect;
export type NewInitiativeRequest = typeof initiativeRequests.$inferInsert;
