import { pgTable, uuid, text, timestamp, primaryKey, boolean, pgEnum } from "drizzle-orm/pg-core";
import { teams } from "./projects";
import { profiles } from "./users";

export const teamRoleEnum = pgEnum("team_role", ["lead", "designer", "pm", "contributor"]);

export const teamMemberships = pgTable(
  "project_members",
  {
    teamId: uuid("project_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    teamRole: teamRoleEnum("team_role").default("designer"),
    isTeamAdmin: boolean("is_team_admin").default(false),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.teamId, table.userId] }),
  })
);

// Backward-compatible alias
export const projectMembers = teamMemberships;

export type TeamMembership = typeof teamMemberships.$inferSelect;
export type NewTeamMembership = typeof teamMemberships.$inferInsert;
// Backward-compatible aliases
export type ProjectMember = typeof teamMemberships.$inferSelect;
export type NewProjectMember = typeof teamMemberships.$inferInsert;
export type TeamRole = "lead" | "designer" | "pm" | "contributor";
