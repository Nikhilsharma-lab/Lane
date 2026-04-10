import { pgTable, uuid, text, timestamp, date } from "drizzle-orm/pg-core";
import { profiles, organizations } from "./users";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#71717a"),
  icon: text("icon"),
  leadId: uuid("lead_id").references(() => profiles.id),
  targetDate: date("target_date"),
  status: text("status").notNull().default("active"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => profiles.id),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
