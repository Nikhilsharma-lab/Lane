import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations, profiles } from "./users";
import { projects } from "./projects";
import type { LabelColour } from "@/lib/request-labels";
export const workspaceLabels = pgTable("workspace_labels", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id"),
  name: text("name").notNull(),
  colour: text("colour").$type<LabelColour>().notNull(),
  createdBy: text("created_by").notNull().references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex("workspace_labels_org_name_unique").on(table.orgId, sql`lower(${table.name})`).where(sql`${table.projectId} is null`),
  uniqueIndex("workspace_labels_project_name_unique").on(table.orgId, table.projectId, sql`lower(${table.name})`).where(sql`${table.projectId} is not null`),
  foreignKey({ name: "workspace_labels_project_fk", columns: [table.orgId, table.projectId], foreignColumns: [projects.orgId, projects.id] }),
  index("workspace_labels_created_by_idx").on(table.createdBy),
  check("workspace_labels_name_check", sql`char_length(${table.name}) between 1 and 80 and ${table.name} = btrim(${table.name}) and (${table.projectId} is not null or lower(${table.name}) not in ('bug', 'improvement', 'new feature'))`),
  check("workspace_labels_colour_check", sql`${table.colour} in ('red','blue','green','yellow','purple','grey')`),
]);
