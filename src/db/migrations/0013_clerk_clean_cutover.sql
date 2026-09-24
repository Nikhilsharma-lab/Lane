-- Destructive pre-GTM reset: Clerk becomes the sole identity and tenancy
-- authority. All existing rows are disposable test data by product decision.
-- Supabase remains the Postgres host and private attachment object store.

BEGIN;

DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.request_attachments CASCADE;
DROP TABLE IF EXISTS public.comments CASCADE;
DROP TABLE IF EXISTS public.requests CASCADE;
DROP TABLE IF EXISTS public.invites CASCADE;
DROP TABLE IF EXISTS public.workspace_members CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

DROP FUNCTION IF EXISTS public.accept_invite_membership(text, uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_invite_context(text) CASCADE;
DROP FUNCTION IF EXISTS public.bootstrap_organization_membership(uuid, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.bootstrap_organization_membership(uuid, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.is_workspace_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_current_org_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.current_app_org_id() CASCADE;
DROP FUNCTION IF EXISTS public.current_app_role() CASCADE;
DROP FUNCTION IF EXISTS public.current_app_user_id() CASCADE;

DROP TYPE IF EXISTS public.workspace_role CASCADE;
DROP TYPE IF EXISTS public.invite_status CASCADE;

CREATE TABLE public.organizations (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_id text,
  plan public.plan NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id text PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  role public.role NOT NULL DEFAULT 'designer',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  affected_people text,
  desired_change text,
  observed_evidence text,
  uncertainty text,
  useful_link text,
  classification public.classification,
  reframed_problem text,
  extracted_solution text,
  status public.request_status NOT NULL DEFAULT 'open',
  assigned_to text REFERENCES public.profiles(id),
  created_by text NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX requests_org_id_idx ON public.requests (org_id);
CREATE INDEX requests_created_by_idx ON public.requests (created_by);

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comments_request_id_idx ON public.comments (request_id);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type public.notification_type NOT NULL,
  request_id uuid REFERENCES public.requests(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_id_idx ON public.notifications (user_id);
CREATE INDEX notifications_user_unread_idx
  ON public.notifications (user_id, read_at);

CREATE TABLE public.request_attachments (
  id uuid PRIMARY KEY,
  org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  uploaded_by text NOT NULL REFERENCES public.profiles(id),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_attachments_size_check
    CHECK (size_bytes > 0 AND size_bytes <= 10485760)
);

CREATE UNIQUE INDEX request_attachments_storage_path_unique
  ON public.request_attachments (storage_path);
CREATE INDEX request_attachments_request_id_idx
  ON public.request_attachments (request_id);
CREATE INDEX request_attachments_org_id_idx
  ON public.request_attachments (org_id);

-- These tables are intentionally server-only. Clerk authorization is checked
-- by Lane before Drizzle opens the database path; browser clients do not query
-- the application schema through the Supabase Data API.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE
      public.organizations,
      public.profiles,
      public.requests,
      public.comments,
      public.notifications,
      public.request_attachments
    FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE
      public.organizations,
      public.profiles,
      public.requests,
      public.comments,
      public.notifications,
      public.request_attachments
    FROM authenticated;
  END IF;
END
$$;

COMMIT;
