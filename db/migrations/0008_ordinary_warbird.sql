ALTER TABLE "published_views" ADD COLUMN "group_by" text;--> statement-breakpoint
ALTER TABLE "published_views" ADD COLUMN "view_mode" text DEFAULT 'list' NOT NULL;--> statement-breakpoint
ALTER TABLE "published_views" ADD COLUMN "sort_by" text;--> statement-breakpoint
ALTER TABLE "published_views" ADD COLUMN "pinned_by" jsonb DEFAULT '[]'::jsonb NOT NULL;