import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  boolean,
} from "drizzle-orm/pg-core";
import { profiles, organizations } from "./users";

export const requestStatusEnum = pgEnum("request_status", [
  "draft",
  "submitted",
  "triaged",
  "assigned",
  "in_progress",
  "in_review",
  "blocked",
  "completed",
  "shipped",
]);

export const priorityEnum = pgEnum("priority", ["p0", "p1", "p2", "p3"]);

export const requestTypeEnum = pgEnum("request_type", [
  "feature",
  "bug",
  "research",
  "content",
  "infra",
  "process",
  "other",
]);

export const stageEnum = pgEnum("stage", [
  "intake",
  "context",
  "shape",
  "bet",
  "explore",
  "validate",
  "handoff",
  "build",
  "impact",
]);

export const requests = pgTable("requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  requesterId: uuid("requester_id")
    .notNull()
    .references(() => profiles.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  businessContext: text("business_context"),
  successMetrics: text("success_metrics"),
  status: requestStatusEnum("status").notNull().default("draft"),
  stage: stageEnum("stage").notNull().default("intake"),
  priority: priorityEnum("priority"),        // set by AI triage
  complexity: integer("complexity"),          // 1-5, set by AI triage
  requestType: requestTypeEnum("request_type"), // set by AI triage
  figmaUrl: text("figma_url"),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const requestAiAnalysis = pgTable("request_ai_analysis", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),
  priority: text("priority").notNull(),
  complexity: integer("complexity").notNull(),
  requestType: text("request_type").notNull(),
  qualityScore: integer("quality_score").notNull(), // 0-100
  qualityFlags: jsonb("quality_flags").$type<string[]>().notNull().default([]),
  summary: text("summary").notNull(),
  reasoning: text("reasoning").notNull(),
  suggestions: jsonb("suggestions").$type<string[]>().notNull().default([]),
  aiModel: text("ai_model").notNull(),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").references(() => profiles.id),
  body: text("body").notNull(),
  isSystem: boolean("is_system").notNull().default(false), // true for AI-generated
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
export type RequestAiAnalysis = typeof requestAiAnalysis.$inferSelect;
export type NewRequestAiAnalysis = typeof requestAiAnalysis.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
