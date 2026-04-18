import { pgTable, uuid, text, timestamp, pgEnum, boolean, type AnyPgColumn } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "pro", "enterprise"]);
export const roleEnum = pgEnum("role", ["pm", "designer", "developer", "lead", "admin"]);

export const workspaces = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerUserId: uuid("owner_id"),
  plan: planEnum("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Backward-compatible alias
export const organizations = workspaces;

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("designer"),
  avatarUrl: text("avatar_url"),
  timezone: text("timezone").default("UTC"),
  managerId: uuid("manager_id").references((): AnyPgColumn => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  isSample: boolean("is_sample").notNull().default(false),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
// Backward-compatible aliases
export type Organization = typeof workspaces.$inferSelect;
export type NewOrganization = typeof workspaces.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
