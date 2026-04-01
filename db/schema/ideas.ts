import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { organizations } from "./users";

export const ideaStatusEnum = pgEnum("idea_status", [
  "pending_votes",
  "validation",
  "approved",
  "approved_with_conditions",
  "rejected",
  "archived",
]);

export const ideaCategoryEnum = pgEnum("idea_category", [
  "design",
  "feature",
  "workflow",
  "performance",
  "ux",
]);

export const voteTypeEnum = pgEnum("vote_type", ["upvote", "downvote"]);

export const ideaValidationDecisionEnum = pgEnum("idea_validation_decision", [
  "approved",
  "approved_with_conditions",
  "rejected",
]);

export const ideas = pgTable("ideas", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id),
  isAnonymous: boolean("is_anonymous").notNull().default(false),
  title: text("title").notNull(),
  problem: text("problem").notNull(),
  proposedSolution: text("proposed_solution").notNull(),
  category: ideaCategoryEnum("category").notNull(),
  impactEstimate: text("impact_estimate"),
  effortEstimateWeeks: integer("effort_estimate_weeks"),
  targetUsers: text("target_users"),
  status: ideaStatusEnum("status").notNull().default("pending_votes"),
  votingEndsAt: timestamp("voting_ends_at", { withTimezone: true }).notNull(),
  linkedRequestId: uuid("linked_request_id"),  // set when approved → auto-creates request
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ideaVotes = pgTable(
  "idea_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ideaId: uuid("idea_id")
      .notNull()
      .references(() => ideas.id, { onDelete: "cascade" }),
    voterId: uuid("voter_id")
      .notNull()
      .references(() => profiles.id),
    voteType: voteTypeEnum("vote_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueVote: unique().on(table.ideaId, table.voterId),
  })
);

export const ideaValidations = pgTable("idea_validations", {
  id: uuid("id").primaryKey().defaultRandom(),
  ideaId: uuid("idea_id")
    .notNull()
    .unique()
    .references(() => ideas.id, { onDelete: "cascade" }),
  validatedById: uuid("validated_by_id")
    .notNull()
    .references(() => profiles.id),
  impactScore: integer("impact_score").notNull(),       // 1-10
  effortEstimate: integer("effort_estimate").notNull(), // 1-10
  feasibilityScore: integer("feasibility_score").notNull(), // 1-10
  roiScore: integer("roi_score").notNull(),             // 1-10
  decision: ideaValidationDecisionEnum("decision").notNull(),
  notes: text("notes"),
  linkedRequestId: uuid("linked_request_id"),
  validatedAt: timestamp("validated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Idea = typeof ideas.$inferSelect;
export type NewIdea = typeof ideas.$inferInsert;
export type IdeaVote = typeof ideaVotes.$inferSelect;
export type NewIdeaVote = typeof ideaVotes.$inferInsert;
export type IdeaValidation = typeof ideaValidations.$inferSelect;
export type NewIdeaValidation = typeof ideaValidations.$inferInsert;
