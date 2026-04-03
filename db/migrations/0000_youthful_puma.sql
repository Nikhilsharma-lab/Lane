CREATE TYPE "public"."plan" AS ENUM('free', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('pm', 'designer', 'developer', 'lead', 'admin');--> statement-breakpoint
CREATE TYPE "public"."design_stage" AS ENUM('explore', 'validate', 'handoff');--> statement-breakpoint
CREATE TYPE "public"."kanban_state" AS ENUM('todo', 'in_progress', 'in_review', 'qa', 'done');--> statement-breakpoint
CREATE TYPE "public"."phase" AS ENUM('predesign', 'design', 'dev', 'track');--> statement-breakpoint
CREATE TYPE "public"."predesign_stage" AS ENUM('intake', 'context', 'shape', 'bet');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('p0', 'p1', 'p2', 'p3');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('draft', 'submitted', 'triaged', 'assigned', 'in_progress', 'in_review', 'blocked', 'completed', 'shipped');--> statement-breakpoint
CREATE TYPE "public"."request_type" AS ENUM('feature', 'bug', 'research', 'content', 'infra', 'process', 'other');--> statement-breakpoint
CREATE TYPE "public"."stage" AS ENUM('intake', 'context', 'shape', 'bet', 'explore', 'validate', 'handoff', 'build', 'impact');--> statement-breakpoint
CREATE TYPE "public"."track_stage" AS ENUM('measuring', 'complete');--> statement-breakpoint
CREATE TYPE "public"."assignment_role" AS ENUM('lead', 'reviewer', 'contributor');--> statement-breakpoint
CREATE TYPE "public"."signer_role" AS ENUM('designer', 'pm', 'design_head');--> statement-breakpoint
CREATE TYPE "public"."signoff_decision" AS ENUM('approved', 'approved_with_conditions', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."idea_category" AS ENUM('design', 'feature', 'workflow', 'performance', 'ux');--> statement-breakpoint
CREATE TYPE "public"."idea_status" AS ENUM('pending_votes', 'validation', 'approved', 'approved_with_conditions', 'rejected', 'archived');--> statement-breakpoint
CREATE TYPE "public"."idea_validation_decision" AS ENUM('approved', 'approved_with_conditions', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."vote_type" AS ENUM('upvote', 'downvote');--> statement-breakpoint
CREATE TYPE "public"."figma_update_phase" AS ENUM('design', 'dev');--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"role" "role" DEFAULT 'designer' NOT NULL,
	"avatar_url" text,
	"timezone" text DEFAULT 'UTC',
	"manager_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_ai_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"priority" text NOT NULL,
	"complexity" integer NOT NULL,
	"request_type" text NOT NULL,
	"quality_score" integer NOT NULL,
	"quality_flags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"summary" text NOT NULL,
	"reasoning" text NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"potential_duplicates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_model" text NOT NULL,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_ai_analysis_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"requester_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"business_context" text,
	"success_metrics" text,
	"status" "request_status" DEFAULT 'draft' NOT NULL,
	"stage" "stage" DEFAULT 'intake' NOT NULL,
	"priority" "priority",
	"complexity" integer,
	"request_type" "request_type",
	"figma_url" text,
	"impact_metric" text,
	"impact_prediction" text,
	"impact_actual" text,
	"impact_logged_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"phase" "phase" DEFAULT 'predesign',
	"predesign_stage" "predesign_stage" DEFAULT 'intake',
	"design_stage" "design_stage",
	"kanban_state" "kanban_state",
	"track_stage" "track_stage",
	"dev_owner_id" uuid,
	"figma_version_id" text,
	"figma_locked_at" timestamp with time zone,
	"linked_idea_id" uuid,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"assignee_id" uuid NOT NULL,
	"assigned_by_id" uuid,
	"role" "assignment_role" DEFAULT 'lead' NOT NULL,
	"notes" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"stage" "stage" NOT NULL,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_by_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"role" text DEFAULT 'designer' NOT NULL,
	"invited_by" uuid,
	"accepted_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "validation_signoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"signer_id" uuid NOT NULL,
	"signer_role" "signer_role" NOT NULL,
	"decision" "signoff_decision" NOT NULL,
	"conditions" text,
	"comments" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"validated_by_id" uuid NOT NULL,
	"impact_score" integer NOT NULL,
	"effort_estimate" integer NOT NULL,
	"feasibility_score" integer NOT NULL,
	"roi_score" integer NOT NULL,
	"decision" "idea_validation_decision" NOT NULL,
	"notes" text,
	"linked_request_id" uuid,
	"validated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_validations_idea_id_unique" UNIQUE("idea_id")
);
--> statement-breakpoint
CREATE TABLE "idea_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"vote_type" "vote_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idea_votes_idea_id_voter_id_unique" UNIQUE("idea_id","voter_id")
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"title" text NOT NULL,
	"problem" text NOT NULL,
	"proposed_solution" text NOT NULL,
	"category" "idea_category" NOT NULL,
	"impact_estimate" text,
	"effort_estimate_weeks" integer,
	"target_users" text,
	"status" "idea_status" DEFAULT 'pending_votes' NOT NULL,
	"voting_ends_at" timestamp with time zone NOT NULL,
	"linked_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "figma_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"figma_file_id" text,
	"figma_file_name" text,
	"figma_file_url" text NOT NULL,
	"figma_version_id" text,
	"updated_by_id" uuid,
	"figma_user_handle" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"change_description" text,
	"change_summary" text,
	"request_phase" "figma_update_phase",
	"post_handoff" boolean DEFAULT false NOT NULL,
	"dev_reviewed" boolean DEFAULT false NOT NULL,
	"dev_reviewed_by_id" uuid,
	"dev_review_notes" text,
	"notification_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impact_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"pm_id" uuid NOT NULL,
	"predicted_metric" text NOT NULL,
	"predicted_value" text NOT NULL,
	"actual_value" text,
	"variance_percent" numeric,
	"notes" text,
	"measured_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "impact_records_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#71717a' NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_context_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"plain_summary" text NOT NULL,
	"related_requests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"key_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"questions_to_ask" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exploration_directions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_model" text NOT NULL,
	"tokens_used" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_context_briefs_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_manager_id_profiles_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_ai_analysis" ADD CONSTRAINT "request_ai_analysis_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_profiles_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_dev_owner_id_profiles_id_fk" FOREIGN KEY ("dev_owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_id_profiles_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_stages" ADD CONSTRAINT "request_stages_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_stages" ADD CONSTRAINT "request_stages_completed_by_id_profiles_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_signoffs" ADD CONSTRAINT "validation_signoffs_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_signoffs" ADD CONSTRAINT "validation_signoffs_signer_id_profiles_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_validations" ADD CONSTRAINT "idea_validations_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_validations" ADD CONSTRAINT "idea_validations_validated_by_id_profiles_id_fk" FOREIGN KEY ("validated_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_votes" ADD CONSTRAINT "idea_votes_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_votes" ADD CONSTRAINT "idea_votes_voter_id_profiles_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_updates" ADD CONSTRAINT "figma_updates_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_updates" ADD CONSTRAINT "figma_updates_updated_by_id_profiles_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_updates" ADD CONSTRAINT "figma_updates_dev_reviewed_by_id_profiles_id_fk" FOREIGN KEY ("dev_reviewed_by_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_records" ADD CONSTRAINT "impact_records_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impact_records" ADD CONSTRAINT "impact_records_pm_id_profiles_id_fk" FOREIGN KEY ("pm_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_context_briefs" ADD CONSTRAINT "request_context_briefs_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;