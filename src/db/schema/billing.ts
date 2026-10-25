import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations } from "./users";

/**
 * Migration 0046 (#213). Only the billing module (src/lib/billing.ts) reads or writes these.
 *
 * `workspace_billing`: one row per workspace. `freeRequestsUsed` is kept by database triggers on `requests` (every
 * Request created, deleted ones included; a Guest submission once taken on) and never goes down. `allowanceKey` /
 * `holdsAllowance` are decided once: the workspace either holds its creator's allowance or another workspace does.
 * `planState` is free until payment arrives (#214).
 */
export const workspaceBilling = pgTable(
  "workspace_billing",
  {
    orgId: text("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
    planState: text("plan_state", { enum: ["free", "paying", "lapsed"] }).notNull().default("free"),
    freeRequestsUsed: integer("free_requests_used").notNull().default(0),
    allowanceKey: text("allowance_key"),
    holdsAllowance: boolean("holds_allowance"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("workspace_billing_plan_state_check", sql`${t.planState} in ('free', 'paying', 'lapsed')`),
    check("workspace_billing_free_requests_used_check", sql`${t.freeRequestsUsed} >= 0`),
    check("workspace_billing_allowance_check", sql`(${t.allowanceKey} is null) = (${t.holdsAllowance} is null)`),
  ],
);

/** A company email domain or a personal email address, and the one workspace that holds its Free Requests. */
export const freeRequestAllowances = pgTable(
  "free_request_allowances",
  {
    allowanceKey: text("allowance_key").primaryKey(),
    kind: text("kind", { enum: ["company_domain", "personal_email"] }).notNull(),
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("free_request_allowances_org_idx").on(t.orgId),
    check("free_request_allowances_kind_check", sql`${t.kind} in ('company_domain', 'personal_email')`),
  ],
);
