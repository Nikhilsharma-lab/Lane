import {
  pgTable,
  pgEnum,
  text,
  uuid,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
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
    actorId: text("actor_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
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
  })
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
