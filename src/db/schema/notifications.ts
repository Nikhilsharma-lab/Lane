import {
  pgTable,
  pgEnum,
  text,
  uuid,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { profiles } from "./users";
import { organizations } from "./users";
import { requests } from "./requests";

export const notificationTypeEnum = pgEnum("notification_type", [
  "request_picked_up",
  "comment_added",
  "request_done",
  "invite_accepted",
  "review_requested",
  "review_responded",
  "review_looks_good",
  "review_concern",
  "review_reset",
  // Reminders (0033): written by Lane with no actor, at most once per Request, recipient and UTC day.
  "release_reminder",
  "result_due_soon",
  "result_due",
  "result_overdue",
]);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    requestId: uuid("request_id").references(() => requests.id, {
      onDelete: "cascade",
    }),
    /** Who caused it; null only for a reminder (notifications_actor_check). */
    actorId: text("actor_id").references(() => profiles.id, {
      onDelete: "cascade",
    }),
    /** A reviewer's question, or the reason for a concern. */
    detail: text("detail"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdIdx: index("notifications_user_id_idx").on(table.userId),
    userUnreadIdx: index("notifications_user_unread_idx").on(
      table.userId,
      table.readAt
    ),
    // The real index is an expression over the UTC day of created_at, which
    // Drizzle cannot describe; see 0033_reminders_and_done_time.sql.
    reminderOnceADay: uniqueIndex("notifications_reminder_once_a_day")
      .on(table.requestId, table.userId, table.type, sql`((${table.createdAt} AT TIME ZONE 'UTC')::date)`)
      .where(sql`${table.type} IN ('release_reminder','result_due_soon','result_due','result_overdue')`),
    actorCheck: check("notifications_actor_check", sql`${table.actorId} IS NOT NULL OR ${table.type} IN ('release_reminder','result_due_soon','result_due','result_overdue')`),
    reminderRequestCheck: check("notifications_reminder_request_check", sql`${table.requestId} IS NOT NULL OR ${table.type} NOT IN ('release_reminder','result_due_soon','result_due','result_overdue')`),
  })
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
