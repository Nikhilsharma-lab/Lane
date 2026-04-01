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

// Legacy flat stage enum — kept for backward compatibility with existing rows
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

// 4-Phase model — new fields added alongside legacy stage
export const phaseEnum = pgEnum("phase", [
  "predesign",
  "design",
  "dev",
  "track",
]);

export const predesignStageEnum = pgEnum("predesign_stage", [
  "intake",
  "context",
  "shape",
  "bet",
]);

export const designStageEnum = pgEnum("design_stage", [
  "explore",
  "validate",
  "handoff",
]);

export const kanbanStateEnum = pgEnum("kanban_state", [
  "todo",
  "in_progress",
  "in_review",
  "qa",
  "done",
]);

export const trackStageEnum = pgEnum("track_stage", [
  "measuring",
  "complete",
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
  // Impact loop — PM enters prediction at intake, logs actual after ship
  impactMetric: text("impact_metric"),       // e.g. "checkout conversion rate"
  impactPrediction: text("impact_prediction"), // e.g. "5% improvement"
  impactActual: text("impact_actual"),        // logged after ship
  impactLoggedAt: timestamp("impact_logged_at", { withTimezone: true }),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }),

  // 4-Phase model — nullable for backward compat; new requests populate these
  phase: phaseEnum("phase").default("predesign"),
  predesignStage: predesignStageEnum("predesign_stage").default("intake"),
  designStage: designStageEnum("design_stage"),
  kanbanState: kanbanStateEnum("kanban_state"),
  trackStage: trackStageEnum("track_stage"),

  // Dev assignment + Figma lock (set at handoff)
  devOwnerId: uuid("dev_owner_id").references(() => profiles.id),
  figmaVersionId: text("figma_version_id"),
  figmaLockedAt: timestamp("figma_locked_at", { withTimezone: true }),

  // If request was created from an approved idea
  linkedIdeaId: uuid("linked_idea_id"),

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
  potentialDuplicates: jsonb("potential_duplicates")
    .$type<{ id: string; title: string; reason: string }[]>()
    .notNull()
    .default([]),
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
export type Phase = "predesign" | "design" | "dev" | "track";
export type PredesignStage = "intake" | "context" | "shape" | "bet";
export type DesignStage = "explore" | "validate" | "handoff";
export type KanbanState = "todo" | "in_progress" | "in_review" | "qa" | "done";
export type TrackStage = "measuring" | "complete";
