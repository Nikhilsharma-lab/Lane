import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const waitlistApprovals = pgTable(
  "waitlist_approvals",
  {
    email: text("email").primaryKey(),
    approvalToken: text("approval_token")
      .notNull()
      .unique()
      .default(sql`encode(gen_random_bytes(24), 'base64')`),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // CHECK (approval_source IN ('auto','manual','admin','campaign')) applied in raw SQL.
    approvalSource: text("approval_source").notNull(),
    // FK to auth.users applied in raw SQL (cross-schema).
    approvedBy: uuid("approved_by"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pendingIdx: index("waitlist_pending")
      .on(table.createdAt.desc())
      .where(sql`approved_at IS NULL`),
  }),
);

export type WaitlistApproval = typeof waitlistApprovals.$inferSelect;
export type NewWaitlistApproval = typeof waitlistApprovals.$inferInsert;
