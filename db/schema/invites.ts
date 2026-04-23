import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, profiles } from "./users";
import { projects } from "./projects";
import { teamRoleEnum } from "./project_members";

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  role: text("role").notNull().default("designer"), // pm | designer | developer | lead | admin
  invitedBy: uuid("invited_by").references(() => profiles.id),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  // FK to auth.users applied in raw SQL (cross-schema).
  acceptedBy: uuid("accepted_by"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Team scoping — optional. If both NULL, invite is workspace-level only.
  // If both set, acceptance RPC also creates a project_members row. Spec §4.2.
  teamId: uuid("team_id").references(() => projects.id, { onDelete: "cascade" }),
  teamRole: teamRoleEnum("team_role"),
});

export type Invite = typeof invites.$inferSelect;
export type NewInvite = typeof invites.$inferInsert;
