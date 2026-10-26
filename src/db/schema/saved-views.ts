import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations, profiles } from "./users";

/**
 * Migration 0052 (#219). A person's own saved view of the Requests list: a name and the list filters it reopens
 * (src/lib/saved-view-rules.ts reads them). Owner-only; nothing is shared or published.
 */
export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("saved_views_owner_name_idx").on(t.orgId, t.ownerId, sql`lower(${t.name})`),
    index("saved_views_owner_idx").on(t.ownerId),
    check("saved_views_name_check", sql`char_length(${t.name}) between 1 and 60 and ${t.name} = btrim(${t.name})`),
    check("saved_views_filters_check", sql`jsonb_typeof(${t.filters}) = 'object'`),
  ],
);
