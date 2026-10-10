import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations, profiles } from "./users";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by").notNull().references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("projects_org_id_id_unique").on(table.orgId, table.id),
  uniqueIndex("projects_org_name_unique").on(table.orgId, sql`lower(${table.name})`),
  index("projects_created_by_idx").on(table.createdBy),
  check("projects_name_check", sql`char_length(${table.name}) between 1 and 80 and ${table.name} = btrim(${table.name})`),
  check("projects_description_check", sql`${table.description} is null or char_length(${table.description}) <= 300`),
]);
