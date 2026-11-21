import {
  pgTable,
  text,
  timestamp,
  pgEnum,
  integer,
  check,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const planEnum = pgEnum("plan", ["free", "pro", "enterprise"]);
export const roleEnum = pgEnum("role", ["pm", "designer", "developer"]);

export const workspaces = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerUserId: text("owner_id"),
  plan: planEnum("plan").notNull().default("free"),
  lastRequestNumber: integer("last_request_number").notNull().default(0),
  // Migration 0055: Better Auth's organization fields. Always kept empty (#333 Q14).
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, table => ({
  lastRequestNumberCheck: check("organizations_last_request_number_check", sql`${table.lastRequestNumber} >= 0`),
}));

// Backward-compatible alias
export const organizations = workspaces;

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("designer"),
  avatarUrl: text("avatar_url"),
  // Migration 0055: Better Auth's user fields. Property names are Better Auth's field names, so its Drizzle
  // adapter finds them. `image` is always kept empty (#344 Q3); `avatarUrl` stays until increment 7 (#335 Q2).
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  lastWorkspaceId: text("last_workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  // One account per address (#369).
  uniqueIndex("profiles_email_unique").on(table.email),
]);

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Organization = typeof workspaces.$inferSelect;
export type NewOrganization = typeof workspaces.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
