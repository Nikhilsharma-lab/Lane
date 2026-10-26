import { sql } from "drizzle-orm";
import { check, integer, pgTable, primaryKey, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./users";

/**
 * Migration 0043 (#209). A workspace's Quarter note: plain text, one per quarter, written and edited only by Admins
 * (src/app/(app)/impact/quarter-note-actions.ts). `editedBy` is shown beside the note, never used for access.
 */
export const quarterNotes = pgTable(
  "quarter_notes",
  {
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    quarter: smallint("quarter").notNull(),
    body: text("body").notNull(),
    editedBy: text("edited_by").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.orgId, t.year, t.quarter] }),
    check("quarter_notes_year_check", sql`${t.year} between 2000 and 2999`),
    check("quarter_notes_quarter_check", sql`${t.quarter} between 1 and 4`),
    check("quarter_notes_body_check", sql`char_length(${t.body}) between 1 and 4000 and ${t.body} = btrim(${t.body})`),
    check("quarter_notes_edited_by_check", sql`char_length(${t.editedBy}) > 0`),
  ],
);
