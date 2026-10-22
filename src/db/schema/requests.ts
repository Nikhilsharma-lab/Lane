import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
  foreignKey,
  jsonb,
  integer,
  check,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations, profiles } from "./users";
import { projects } from "./projects";
import type { ExpectedImpact, IncompleteMeasurement } from "@/lib/request-impact";
import type { ReleaseState } from "@/lib/request-release";
import type { ClosureCorrection, OutcomeClosure, OutcomeException } from "@/lib/request-outcome";
import type { SavedDesignReview } from "@/lib/request-design-link";

export const requestTypeEnum = pgEnum("request_type", ["bug", "improvement", "new_feature"]);

export const requestPriorityEnum = pgEnum("request_priority", ["none", "urgent", "high", "medium", "low"]);

export const classificationEnum = pgEnum("classification", [
  "problem",
  "solution",
  "hybrid",
]);

export const requestStatusEnum = pgEnum("request_status", [
  "open",
  "in_progress",
  "done",
]);

export const requests = pgTable(
  "requests",
  {
    releaseState: jsonb("release_state").$type<ReleaseState>(),
    agreementRevision: integer("agreement_revision").notNull().default(0),
    exceptionClosure: jsonb("exception_closure").$type<OutcomeException>(),
    outcomeClosure: jsonb("outcome_closure").$type<OutcomeClosure>(),
    closureCorrections: jsonb("closure_corrections").$type<ClosureCorrection[]>().notNull().default([]),
    followUpOf: uuid("follow_up_of"),
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The database allocator replaces the insert-only zero sentinel before save.
    requestNumber: integer("request_number").notNull().default(0),
    projectId: uuid("project_id"),
    requestType: requestTypeEnum("request_type"),
    labelKeys: text("label_keys").array(),
    priority: requestPriorityEnum("priority").notNull().default("none"),
    expectedImpact: jsonb("expected_impact").$type<ExpectedImpact>(),
    measurementDraft: jsonb("measurement_draft").$type<IncompleteMeasurement>(),
    designReviews: jsonb("design_reviews").$type<SavedDesignReview[]>().notNull().default([]),
    designReviewVersion: integer("design_review_version").notNull().default(0),
    title: text("title").notNull(),
    description: text("description").notNull(),
    affectedPeople: text("affected_people"),
    desiredChange: text("desired_change"),
    observedEvidence: text("observed_evidence"),
    uncertainty: text("uncertainty"),
    usefulLink: text("useful_link"),
    classification: classificationEnum("classification"),
    reframedProblem: text("reframed_problem"),
    extractedSolution: text("extracted_solution"),
    status: requestStatusEnum("status").notNull().default("open"),
    assignedTo: text("assigned_to").references(() => profiles.id),
    createdBy: text("created_by")
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** When the work was marked Done; set and cleared by the stamp_done_at trigger (0034). Who marked it is not kept. */
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** When the work was picked up; set and cleared by the stamp_picked_up_at trigger (0034). Unknown (null) for work picked up before it. */
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
  },
  (table) => ({
    requestNumberCheck: check("requests_request_number_check", sql`${table.requestNumber} > 0`),
    doneAtCheck: check("requests_done_at_check", sql`(${table.status} = 'done') = (${table.doneAt} IS NOT NULL)`),
    pickedUpAtCheck: check("requests_picked_up_at_check", sql`${table.status} <> 'open' OR ${table.pickedUpAt} IS NULL`),
    designReviewsCheck: check("requests_design_reviews_check", sql`jsonb_typeof(${table.designReviews}) = 'array'`),
    designReviewVersionCheck: check("requests_design_review_version_check", sql`${table.designReviewVersion} >= 0`),
    orgIdUnique: unique("requests_org_id_id_unique").on(table.orgId, table.id),
    orgRequestNumberUnique: unique("requests_org_request_number_unique").on(table.orgId, table.requestNumber),
    projectFk: foreignKey({ name: "requests_project_workspace_fk", columns: [table.orgId, table.projectId], foreignColumns: [projects.orgId, projects.id] }),
    followUpFk: foreignKey({ name: "requests_follow_up_workspace_fk", columns: [table.orgId, table.followUpOf], foreignColumns: [table.orgId, table.id] }),
    projectIdIdx: index("requests_project_id_idx").on(table.projectId),
    orgIdIdx: index("requests_org_id_idx").on(table.orgId),
    createdByIdx: index("requests_created_by_idx").on(table.createdBy),
  })
);

export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
