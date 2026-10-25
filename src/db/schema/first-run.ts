import { sql } from "drizzle-orm";
import { check, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, profiles } from "./users";

/** #217: which first run a person got in a workspace. */
export type FirstRunGuideKind = "first_request" | "joined";

/**
 * Migration 0050. One first run per person per workspace: the guide, the steps read, and whether it was skipped or
 * finished (reopening it from help clears both).
 */
export const firstRunProgress = pgTable(
  "first_run_progress",
  {
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    guide: text("guide").$type<FirstRunGuideKind>().notNull(),
    steps: text("steps").array().notNull().default(sql`'{}'::text[]`),
    skippedAt: timestamp("skipped_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    index("first_run_progress_user_idx").on(t.userId),
    check("first_run_progress_guide_check", sql`${t.guide} in ('first_request', 'joined')`),
    check("first_run_progress_steps_check", sql`${t.steps} <@ array['framing', 'prediction', 'reviewers', 'free_requests', 'release', 'inbox']::text[]`),
  ],
);
