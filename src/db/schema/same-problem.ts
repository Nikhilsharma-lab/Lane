import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { requests } from "./requests";
import { organizations } from "./users";

/**
 * Migration 0051 (#218). Which Same problem group a Request is in: one group at most. A group is only its members'
 * shared `groupId` (no table of its own); it never spans workspaces, and one left with a single Request ends (both
 * by trigger). Iteration numbers come from the Requests' creation order and are never stored.
 */
export const sameProblemMembers = pgTable(
  "same_problem_members",
  {
    orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    requestId: uuid("request_id").primaryKey(),
    groupId: uuid("group_id").notNull(),
    addedBy: text("added_by").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "same_problem_members_request_fk", columns: [t.orgId, t.requestId], foreignColumns: [requests.orgId, requests.id] }).onDelete("cascade"),
    index("same_problem_members_group_idx").on(t.orgId, t.groupId),
    index("same_problem_members_group_only_idx").on(t.groupId),
    check("same_problem_members_added_by_check", sql`${t.addedBy} <> ''`),
  ],
);

export type SameProblemEventKind = "linked" | "removed";

/**
 * A Request's history of Same problem links (migration 0051): append-only, kept while the Request exists.
 * `linked` names the Request it was linked with; `removed` names nothing when this Request was taken out, or the
 * Request whose removal ended this one's group. The other Request's number is kept so the line reads after a delete.
 */
export const sameProblemEvents = pgTable(
  "same_problem_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id").notNull(),
    requestId: uuid("request_id").notNull(),
    kind: text("kind").$type<SameProblemEventKind>().notNull(),
    otherRequestId: uuid("other_request_id"),
    otherRequestNumber: integer("other_request_number"),
    actorId: text("actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ name: "same_problem_events_request_fk", columns: [t.orgId, t.requestId], foreignColumns: [requests.orgId, requests.id] }).onDelete("cascade"),
    index("same_problem_events_request_idx").on(t.orgId, t.requestId, t.createdAt),
    check("same_problem_events_kind_check", sql`${t.kind} in ('linked', 'removed')`),
    check("same_problem_events_other_number_check", sql`${t.otherRequestNumber} > 0`),
    check("same_problem_events_actor_check", sql`${t.actorId} <> ''`),
    check("same_problem_events_other_check", sql`(${t.otherRequestId} is null) = (${t.otherRequestNumber} is null)`),
    check("same_problem_events_linked_check", sql`${t.kind} <> 'linked' or ${t.otherRequestId} is not null`),
  ],
);
