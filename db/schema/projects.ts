import { pgTable, uuid, text, timestamp, date, unique } from "drizzle-orm/pg-core";
import { profiles, workspaces } from "./users";

export const teams = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug"),
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
  },
  (table) => ({
    uniqueOrgSlug: unique().on(table.orgId, table.slug),
  })
);

// Backward-compatible alias
export const projects = teams;

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
// Backward-compatible aliases
export type Project = typeof teams.$inferSelect;
export type NewProject = typeof teams.$inferInsert;
