import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { requests } from "./requests";

export const signerRoleEnum = pgEnum("signer_role", [
  "designer",
  "pm",
  "design_head",
]);

export const signoffDecisionEnum = pgEnum("signoff_decision", [
  "approved",
  "approved_with_conditions",
  "rejected",
]);

export const validationSignoffs = pgTable("validation_signoffs", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  signerId: uuid("signer_id")
    .notNull()
    .references(() => profiles.id),
  signerRole: signerRoleEnum("signer_role").notNull(),
  decision: signoffDecisionEnum("decision").notNull(),
  conditions: text("conditions"),   // text when "approved_with_conditions"
  comments: text("comments"),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ValidationSignoff = typeof validationSignoffs.$inferSelect;
export type NewValidationSignoff = typeof validationSignoffs.$inferInsert;
