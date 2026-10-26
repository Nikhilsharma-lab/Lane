-- #207 (spec #195, item 2): an Admin connects Slack once per workspace, through Slack's standard install flow,
-- so people can choose Slack DM for their Needs-you items. One row per workspace; disconnecting deletes it, and
-- then people who chose Slack DM get Email instead. The bot token is stored only sealed by Lane (AES-256-GCM
-- under LANE_SLACK_TOKEN_KEY, bound to the workspace; src/lib/slack-token.ts), so the column refuses anything
-- that is not in the sealed form, including a plain Slack token. `connected_by` names no profile on purpose,
-- like the delivery log: who connected it is shown, never used for access.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.slack_connections (
  org_id text PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id text NOT NULL CONSTRAINT slack_connections_team_id_check CHECK (char_length(btrim(team_id)) BETWEEN 1 AND 64),
  team_name text NOT NULL CONSTRAINT slack_connections_team_name_check CHECK (char_length(btrim(team_name)) BETWEEN 1 AND 200),
  token_ciphertext text NOT NULL
    CONSTRAINT slack_connections_token_sealed CHECK (token_ciphertext ~ '^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$'),
  connected_by text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.slack_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.slack_connections FROM PUBLIC;
-- Guarded like 0028: Supabase has these roles, a plain Postgres (CI, fresh local) does not.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.slack_connections FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.slack_connections FROM authenticated; END IF;
END $$;

COMMIT;
