-- Align invites table with the membership spec:
-- - Add invite_status enum + status column
-- - Change role from functional label (text) to workspace permission role (workspace_role enum)
-- - Drop unused accepted_by column
-- - Add partial unique index: one pending invite per (org, email)

CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'revoked', 'expired');

ALTER TABLE "invites" ADD COLUMN "status" "invite_status" NOT NULL DEFAULT 'pending';

-- Mark already-accepted invites
UPDATE "invites" SET "status" = 'accepted' WHERE "accepted_at" IS NOT NULL;

-- Convert role from text (pm/designer/developer) to workspace_role enum (owner/admin/member)
ALTER TABLE "invites" ALTER COLUMN "role" DROP DEFAULT;
UPDATE "invites" SET "role" = 'member' WHERE "role" NOT IN ('owner', 'admin', 'member');
ALTER TABLE "invites" ALTER COLUMN "role" TYPE "workspace_role" USING "role"::"workspace_role";
ALTER TABLE "invites" ALTER COLUMN "role" SET DEFAULT 'member';

ALTER TABLE "invites" DROP COLUMN IF EXISTS "accepted_by";

CREATE UNIQUE INDEX "uq_invite_pending_email_org"
  ON "invites" ("org_id", "email")
  WHERE "status" = 'pending';
