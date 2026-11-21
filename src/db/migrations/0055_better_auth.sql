-- #370 (spec #369, plan #349): what Better Auth needs, added beside the Clerk build. Better Auth's `user` is
-- `profiles` and its `organization` is `organizations`; the six tables below are its own, in Better Auth 1.7.26's
-- generated shape (Drizzle generator, Postgres) with timestamptz. Nothing is dropped, renamed or rewritten, so the
-- Clerk build keeps working against a database that has this (#335 Q2); `profiles.avatar_url` stays until increment 7.
-- Local lane_test databases only until increment 6, which applies it after a verified, encrypted backup, staging
-- before production. Before applying it to a copy of real data, check `profiles` for duplicate emails: the unique
-- index below is the one statement that can fail on existing rows.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Better Auth's user fields. `image` and the workspace's `logo` and `metadata` exist only because Better Auth's
-- schema check needs them; Lane's hooks keep them empty (#344 Q3, #333 Q14). `last_workspace_id` is for increment 5's
-- "open the workspace you last used" (#333 Q12).
ALTER TABLE public.profiles
  ADD COLUMN email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN image text,
  ADD COLUMN last_workspace_id text REFERENCES public.organizations(id) ON DELETE SET NULL;
-- One account per address (#369).
CREATE UNIQUE INDEX profiles_email_unique ON public.profiles (email);

ALTER TABLE public.organizations
  ADD COLUMN logo text,
  ADD COLUMN metadata text;

CREATE TABLE public.session (
  id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL,
  ip_address text,
  user_agent text,
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  active_organization_id text
);
CREATE INDEX session_user_id_idx ON public.session (user_id);

CREATE TABLE public.account (
  id text PRIMARY KEY,
  account_id text NOT NULL,
  provider_id text NOT NULL,
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL
);
CREATE INDEX account_user_id_idx ON public.account (user_id);

CREATE TABLE public.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier_idx ON public.verification (identifier);

CREATE TABLE public.member (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL
);
-- Lane's addition: one membership per person per workspace.
CREATE UNIQUE INDEX member_organization_id_user_id_idx ON public.member (organization_id, user_id);
CREATE INDEX member_organization_id_idx ON public.member (organization_id);
CREATE INDEX member_user_id_idx ON public.member (user_id);

CREATE TABLE public.invitation (
  id text PRIMARY KEY,
  organization_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  inviter_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE
);
CREATE INDEX invitation_organization_id_idx ON public.invitation (organization_id);
CREATE INDEX invitation_email_idx ON public.invitation (email);

CREATE TABLE public.rate_limit (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  last_request bigint NOT NULL
);

-- No Data API access, as 0013/0014: these hold password hashes, sessions and tokens.
-- Guarded like 0028: Supabase has anon and authenticated, a plain Postgres (CI, fresh local) does not.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['session', 'account', 'verification', 'member', 'invitation', 'rate_limit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', t); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t); END IF;
  END LOOP;
END $$;

COMMIT;
