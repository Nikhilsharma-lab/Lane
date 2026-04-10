import { pgTable, uuid, boolean, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./users";

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: "cascade" }),
  nudgesInApp: boolean("nudges_in_app").notNull().default(true),
  nudgesEmail: boolean("nudges_email").notNull().default(false),
  commentsInApp: boolean("comments_in_app").notNull().default(true),
  commentsEmail: boolean("comments_email").notNull().default(true),
  stageChangesInApp: boolean("stage_changes_in_app").notNull().default(true),
  stageChangesEmail: boolean("stage_changes_email").notNull().default(false),
  mentionsInApp: boolean("mentions_in_app").notNull().default(true),
  mentionsEmail: boolean("mentions_email").notNull().default(true),
  weeklyDigestEmail: boolean("weekly_digest_email").notNull().default(true),
  morningBriefingInApp: boolean("morning_briefing_in_app").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
