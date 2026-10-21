import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  unique,
  foreignKey,
  index,
} from "drizzle-orm/pg-core";
import { requests } from "./requests";
import type {
  AgreementConcern,
  AgreementSeats,
  AgreementSnapshot,
  PreparedAgreement,
} from "@/lib/request-agreement";
export const requestAgreements = pgTable(
  "request_agreements",
  {
    requestId: uuid("request_id").primaryKey(),
    orgId: text("org_id").notNull(),
    prepared: jsonb("prepared").$type<PreparedAgreement>().notNull(),
    snapshot: jsonb("snapshot").$type<AgreementSnapshot>(),
    submittedBy: text("submitted_by"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    seats: jsonb("seats").$type<AgreementSeats>().notNull(),
    concerns: jsonb("concerns")
      .$type<AgreementConcern[]>()
      .notNull()
      .default([]),
  },
  (t) => [
    unique().on(t.orgId, t.requestId),
    foreignKey({
      columns: [t.orgId, t.requestId],
      foreignColumns: [requests.orgId, requests.id],
    }),
    index().on(t.orgId),
  ],
);
export const requestAgreementEvents = pgTable(
  "request_agreement_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    requestId: uuid("request_id").notNull(),
    revision: integer("revision").notNull(),
    operationId: uuid("operation_id").notNull(),
    actorId: text("actor_id").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload")
      .$type<{
        version: 1;
        fingerprint: string;
        input: unknown;
        before?: unknown;
        after?: unknown;
        result: { success: true; revision: number; replacementId?: string };
      }>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique().on(t.requestId, t.revision),
    unique().on(t.orgId, t.actorId, t.operationId),
    foreignKey({
      columns: [t.orgId, t.requestId],
      foreignColumns: [requestAgreements.orgId, requestAgreements.requestId],
    }),
    index().on(t.orgId, t.requestId, t.createdAt, t.id),
  ],
);
export const requestReplacements = pgTable(
  "request_replacements",
  {
    originalId: uuid("original_id").primaryKey(),
    replacementId: uuid("replacement_id").notNull().unique(),
    orgId: text("org_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reason: text("reason").notNull(),
    changedFields: jsonb("changed_fields").$type<string[]>().notNull(),
    confirmedBy: text("confirmed_by"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.orgId, t.originalId],
      foreignColumns: [requests.orgId, requests.id],
    }),
    foreignKey({
      columns: [t.orgId, t.replacementId],
      foreignColumns: [requests.orgId, requests.id],
    }),
    index().on(t.orgId, t.replacementId),
  ],
);
