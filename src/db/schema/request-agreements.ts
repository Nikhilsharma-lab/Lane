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
import type { Reviewer } from "@/lib/request-reviewer-rules";
export const requestAgreements = pgTable(
  "request_agreements",
  {
    requestId: uuid("request_id").primaryKey(),
    orgId: text("org_id").notNull(),
    reviewers: jsonb("reviewers").$type<Reviewer[]>().notNull().default([]),
  },
  (t) => [
    unique().on(t.orgId, t.requestId),
    foreignKey({
      columns: [t.orgId, t.requestId],
      foreignColumns: [requests.orgId, requests.id],
    }).onDelete("cascade"),
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
        result: { success: true; revision: number };
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
    }).onDelete("cascade"),
    index().on(t.orgId, t.requestId, t.createdAt, t.id),
  ],
);
