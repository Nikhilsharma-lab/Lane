import { pgTable, uuid, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { organizations } from "./users";
import { profiles } from "./users";

export interface ViewFilters {
  phase?: string[];
  priority?: string[];
  projectId?: string[];
  initiativeId?: string[];
  cycleId?: string[];
  designStage?: string[];
  assigneeId?: string[];
  kanbanState?: string[];
  status?: string[];
  createdBy?: string[];
}

export const publishedViews = pgTable("published_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => profiles.id),
  name: text("name").notNull(),
  description: text("description"),
  viewType: text("view_type").notNull(),
  filters: jsonb("filters").$type<ViewFilters>().notNull().default({}),
  accessMode: text("access_mode").notNull().default("authenticated"),
  publicToken: text("public_token").unique(),
  allowComments: boolean("allow_comments").notNull().default(false),
  allowVoting: boolean("allow_voting").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  groupBy: text("group_by"),
  viewMode: text("view_mode").notNull().default("list"),
  sortBy: text("sort_by"),
  pinnedBy: jsonb("pinned_by").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PublishedView = typeof publishedViews.$inferSelect;
export type NewPublishedView = typeof publishedViews.$inferInsert;
