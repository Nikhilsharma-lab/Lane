import { pgTable, uuid, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";
import { requests } from "./requests";

export const streamGuests = pgTable(
  "stream_guests",
  {
    streamId: uuid("stream_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    invitedBy: uuid("invited_by").notNull(),
    canComment: boolean("can_comment").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.streamId, table.userId] }),
  })
);

export type StreamGuest = typeof streamGuests.$inferSelect;
export type NewStreamGuest = typeof streamGuests.$inferInsert;
