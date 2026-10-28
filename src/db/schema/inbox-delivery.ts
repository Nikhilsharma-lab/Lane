import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { requests } from "./requests";
import { organizations, profiles } from "./users";

/** How a person's Needs-you items reach them outside Lane, per workspace (#206). No row means Email. */
export type DeliveryChannel = "email" | "slack" | "off";

/** Migration 0041. One choice per person per workspace. */
export const deliveryPreferences = pgTable(
  "delivery_preferences",
  {
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    channel: text("channel").$type<DeliveryChannel>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.userId] }),
    index("delivery_preferences_user_idx").on(t.userId),
    check("delivery_preferences_channel_check", sql`${t.channel} in ('email', 'slack', 'off')`),
  ],
);

/**
 * Migration 0041. Each person's Needs-you item (the Inbox read model's key) once, with the channel and when it
 * went out; `would_send` while the Email switch is off. Rows are never updated; a failed send deletes its own.
 */
export const deliveryLog = pgTable(
  "delivery_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    requestId: uuid("request_id").notNull(),
    itemKey: text("item_key").notNull(),
    channel: text("channel").$type<"email" | "slack">().notNull(),
    outcome: text("outcome").$type<"sent" | "would_send">().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("delivery_log_once").on(t.orgId, t.userId, t.itemKey),
    foreignKey({ name: "delivery_log_request_fk", columns: [t.orgId, t.requestId], foreignColumns: [requests.orgId, requests.id] }).onDelete("cascade"),
    index("delivery_log_request_idx").on(t.orgId, t.requestId),
    check("delivery_log_item_key_check", sql`char_length(${t.itemKey}) between 1 and 300`),
    check("delivery_log_channel_check", sql`${t.channel} in ('email', 'slack')`),
    check("delivery_log_outcome_check", sql`${t.outcome} in ('sent', 'would_send')`),
  ],
);
