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
import type { ExpectedImpact } from "@/lib/request-impact";

export const requestTypeEnum = pgEnum("request_type", ["bug", "improvement", "new_feature"]);

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
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The database allocator replaces the insert-only zero sentinel before save.
    requestNumber: integer("request_number").notNull().default(0),
    projectId: uuid("project_id"),
    requestType: requestTypeEnum("request_type"),
    expectedImpact: jsonb("expected_impact").$type<ExpectedImpact>(),
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
  },
  (table) => ({
    requestNumberCheck: check("requests_request_number_check", sql`${table.requestNumber} > 0`),
    orgRequestNumberUnique: unique("requests_org_request_number_unique").on(table.orgId, table.requestNumber),
    projectFk: foreignKey({ name: "requests_project_workspace_fk", columns: [table.orgId, table.projectId], foreignColumns: [projects.orgId, projects.id] }),
    projectIdIdx: index("requests_project_id_idx").on(table.projectId),
    orgIdIdx: index("requests_org_id_idx").on(table.orgId),
    createdByIdx: index("requests_created_by_idx").on(table.createdBy),
  })
);

export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
