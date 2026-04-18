import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { requests } from "./requests";

// Linear-style notification types
export const notificationTypeEnum = pgEnum("notification_type", [
  "assigned",           // You were assigned to a request
  "unassigned",         // You were removed from a request
  "comment",            // Someone commented on a request you're subscribed to
  "mention",            // Someone @mentioned you
  "stage_change",       // Request moved to a new stage/phase
  "signoff_requested",  // Your sign-off is needed (prove gate)
  "signoff_submitted",  // Someone submitted a sign-off on your request
  "request_approved",   // All sign-offs received, moving to dev
  "request_rejected",   // Sign-off rejected, sent back
  "figma_update",       // Figma file updated (especially post-handoff)
  "idea_vote",          // Someone voted on your idea
  "idea_approved",      // Your idea was approved and became a request
  "nudge",              // AI nudge (private to designer)
  "project_update",     // Project you're a member of has updates
  "weekly_digest",      // Weekly AI digest landed (Fridays)
]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull(),

  // Who receives this notification
  recipientId: uuid("recipient_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),

  // Who triggered this notification (null for system/AI)
  actorId: uuid("actor_id").references(() => profiles.id, {
    onDelete: "set null",
  }),

  type: notificationTypeEnum("type").notNull(),

  // The request this is about (optional — idea votes won't have one)
  requestId: uuid("request_id").references(() => requests.id, {
    onDelete: "cascade",
  }),

  // Human-readable content
  title: text("title").notNull(),           // e.g. "Alex commented on LANE-42"
  body: text("body"),                        // Preview text (comment snippet, etc.)
  url: text("url").notNull(),               // Where clicking takes you

  // Linear-style states
  readAt: timestamp("read_at", { withTimezone: true }),         // When marked as read
  archivedAt: timestamp("archived_at", { withTimezone: true }), // When marked as done / archived
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }), // Snooze until this time

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
