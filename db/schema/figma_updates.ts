import { pgTable, uuid, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { requests } from "./requests";

export const figmaUpdatePhaseEnum = pgEnum("figma_update_phase", [
  "design",
  "dev",
]);

export const figmaUpdates = pgTable("figma_updates", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),

  // Figma file metadata
  figmaFileId: text("figma_file_id"),        // parsed from URL
  figmaFileName: text("figma_file_name"),
  figmaFileUrl: text("figma_file_url").notNull(),
  figmaVersionId: text("figma_version_id"),

  // Who made the change and when
  updatedById: uuid("updated_by_id")
    .notNull()
    .references(() => profiles.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

  // What changed
  changeDescription: text("change_description"),  // e.g. "Updated color tokens"
  changeSummary: text("change_summary"),           // e.g. "2 files, 15 components"

  // Context at time of update
  requestPhase: figmaUpdatePhaseEnum("request_phase"),

  // Post-handoff flag — critical for dev phase alerts
  postHandoff: boolean("post_handoff").notNull().default(false),
  devReviewed: boolean("dev_reviewed").notNull().default(false),
  devReviewedById: uuid("dev_reviewed_by_id").references(() => profiles.id),
  devReviewNotes: text("dev_review_notes"),

  notificationSentAt: timestamp("notification_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FigmaUpdate = typeof figmaUpdates.$inferSelect;
export type NewFigmaUpdate = typeof figmaUpdates.$inferInsert;
