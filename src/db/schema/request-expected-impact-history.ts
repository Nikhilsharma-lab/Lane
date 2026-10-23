import { foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { requests } from "./requests";
import { profiles } from "./users";
import type { ExpectedImpact } from "@/lib/request-impact";

/** Every saved version of a Request's Expected impact. Written by migration 0035; never edited. */
export const requestExpectedImpactRevisions = pgTable(
  "request_expected_impact_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    requestId: uuid("request_id").notNull(),
    revision: integer("revision").notNull(),
    /** Exactly one of a measured plan or the "No measurable impact" choice (migration 0036). */
    expectedImpact: jsonb("expected_impact").$type<ExpectedImpact>(),
    noMeasurableImpactReason: text("no_measurable_impact_reason"),
    authorId: text("author_id").notNull().references(() => profiles.id),
    recordedAs: text("recorded_as").$type<"created" | "revised" | "backfilled">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.requestId, t.revision),
    foreignKey({
      columns: [t.orgId, t.requestId],
      foreignColumns: [requests.orgId, requests.id],
    }).onDelete("cascade"),
    index().on(t.orgId, t.requestId, t.revision),
  ],
);
