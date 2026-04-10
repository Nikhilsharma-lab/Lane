import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { organizations } from "./users";
import { requests } from "./requests";

export const stickies = pgTable("stickies", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id),
  requestId: uuid("request_id").references(() => requests.id, { onDelete: "set null" }),
  content: text("content").notNull(),
  color: text("color").notNull().default("cream"),
  isPinned: boolean("is_pinned").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Sticky = typeof stickies.$inferSelect;
export type NewSticky = typeof stickies.$inferInsert;
