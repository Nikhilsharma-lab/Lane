CREATE TABLE "figma_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"scopes" text,
	"connected_by_id" uuid,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "figma_connections_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
ALTER TABLE "figma_connections" ADD CONSTRAINT "figma_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "figma_connections" ADD CONSTRAINT "figma_connections_connected_by_id_profiles_id_fk" FOREIGN KEY ("connected_by_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;