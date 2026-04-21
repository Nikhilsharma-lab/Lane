CREATE TYPE "public"."team_role" AS ENUM('lead', 'designer', 'pm', 'contributor');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('assigned', 'unassigned', 'comment', 'mention', 'stage_change', 'signoff_requested', 'signoff_submitted', 'request_approved', 'request_rejected', 'figma_update', 'idea_vote', 'idea_approved', 'nudge', 'project_update', 'weekly_digest');--> statement-breakpoint
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'admin', 'member', 'guest');--> statement-breakpoint
CREATE TABLE "decision_log_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"title" text NOT NULL,
	"entry_type" text NOT NULL,
	"rationale" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"actor_id" uuid,
	"type" "notification_type" NOT NULL,
	"request_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"url" text NOT NULL,
	"read_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"onboarded_at" timestamp with time zone,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "stream_guests" (
	"stream_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"invited_by" uuid NOT NULL,
	"can_comment" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "stream_guests_stream_id_user_id_pk" PRIMARY KEY("stream_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"user_id" uuid,
	"event_name" text NOT NULL,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "weekly_digests" DROP CONSTRAINT "weekly_digests_org_id_unique";--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "seen_hints" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "sensing_summary" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "design_frame_problem" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "design_frame_success_criteria" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "design_frame_constraints" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "design_frame_divergence" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "engineering_feasibility" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "intake_justification" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "ai_flagged" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "ai_classifier_result" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "ai_extracted_problem" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "ai_extracted_solution" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "team_role" "team_role" DEFAULT 'designer';--> statement-breakpoint
ALTER TABLE "project_members" ADD COLUMN "is_team_admin" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "request_handoff_briefs" ADD COLUMN "accessibility_gaps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_digests" ADD COLUMN "week_start_date" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "iterations" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "decision_log_entries" ADD CONSTRAINT "decision_log_entries_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_log_entries" ADD CONSTRAINT "decision_log_entries_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_profiles_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_organizations_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_guests" ADD CONSTRAINT "stream_guests_stream_id_requests_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_workspace_id_organizations_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_log_entries_request_id_idx" ON "decision_log_entries" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_id_idx" ON "notifications" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "analytics_events_user_time" ON "analytics_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_name_time" ON "analytics_events" USING btree ("event_name","created_at");--> statement-breakpoint
CREATE INDEX "comments_request_id_idx" ON "comments" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "requests_org_id_idx" ON "requests" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "requests_designer_owner_id_idx" ON "requests" USING btree ("designer_owner_id");--> statement-breakpoint
CREATE INDEX "requests_requester_id_idx" ON "requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "requests_project_id_idx" ON "requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "requests_phase_idx" ON "requests" USING btree ("phase");--> statement-breakpoint
CREATE INDEX "assignments_assignee_id_idx" ON "assignments" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "assignments_request_id_idx" ON "assignments" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "iterations_request_id_idx" ON "iterations" USING btree ("request_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_slug_unique" UNIQUE("org_id","slug");--> statement-breakpoint
ALTER TABLE "weekly_digests" ADD CONSTRAINT "weekly_digests_org_id_week_start_date_unique" UNIQUE("org_id","week_start_date");