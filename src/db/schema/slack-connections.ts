import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./users";

/**
 * Migration 0042 (#207). A workspace's Slack connection, made once by an Admin; deleting the row disconnects.
 * `tokenCiphertext` is the bot token sealed by `src/lib/slack-token.ts`; the column refuses a plain token.
 */
export const slackConnections = pgTable(
  "slack_connections",
  {
    orgId: text("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull(),
    teamName: text("team_name").notNull(),
    tokenCiphertext: text("token_ciphertext").notNull(),
    connectedBy: text("connected_by").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("slack_connections_team_id_check", sql`char_length(btrim(${t.teamId})) between 1 and 64`),
    check("slack_connections_team_name_check", sql`char_length(btrim(${t.teamName})) between 1 and 200`),
    check("slack_connections_token_sealed", sql`${t.tokenCiphertext} ~ '^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'`),
  ],
);
