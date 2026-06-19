--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)
-- Cleaned for local/CI use: restrict directives removed, authenticated role created.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;


--
-- Name: classification; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.classification AS ENUM (
    'problem',
    'solution',
    'hybrid'
);


--
-- Name: invite_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invite_status AS ENUM (
    'pending',
    'accepted',
    'revoked',
    'expired'
);


--
-- Name: plan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.plan AS ENUM (
    'free',
    'pro',
    'enterprise'
);


--
-- Name: request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.request_status AS ENUM (
    'open',
    'in_progress',
    'done'
);


--
-- Name: role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.role AS ENUM (
    'pm',
    'designer',
    'developer'
);


--
-- Name: workspace_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.workspace_role AS ENUM (
    'owner',
    'admin',
    'member',
    'guest'
);


--
-- Name: bootstrap_organization_membership(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bootstrap_organization_membership(target_user_id uuid, target_org_name text, target_org_slug text, target_full_name text, target_email text) RETURNS TABLE(org_id uuid, profile_created boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  existing_profile public.profiles%ROWTYPE;
  created_org public.organizations%ROWTYPE;
BEGIN
  SELECT *
  INTO existing_profile
  FROM public.profiles
  WHERE id = target_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT existing_profile.org_id, false;
    RETURN;
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES (target_org_name, target_org_slug)
  RETURNING *
  INTO created_org;

  INSERT INTO public.profiles (id, org_id, full_name, email, role)
  VALUES (target_user_id, created_org.id, target_full_name, target_email, 'designer');

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (created_org.id, target_user_id, 'owner');

  RETURN QUERY SELECT created_org.id, true;
END;
$$;


--
-- Name: bootstrap_organization_membership(uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bootstrap_organization_membership(target_user_id uuid, target_org_name text, target_org_slug text, target_full_name text, target_email text, target_role text DEFAULT 'designer'::text) RETURNS TABLE(org_id uuid, profile_created boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  existing_profile public.profiles%ROWTYPE;
  created_org public.organizations%ROWTYPE;
  final_slug text;
  attempt int := 0;
BEGIN
  SELECT *
  INTO existing_profile
  FROM public.profiles
  WHERE id = target_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT existing_profile.org_id, false;
    RETURN;
  END IF;

  -- Retry slug with numeric suffix on collision (max 10 attempts)
  final_slug := target_org_slug;
  LOOP
    BEGIN
      INSERT INTO public.organizations (name, slug)
      VALUES (target_org_name, final_slug)
      RETURNING *
      INTO created_org;
      EXIT; -- success
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      IF attempt >= 10 THEN
        RAISE EXCEPTION 'Could not generate unique workspace slug after 10 attempts';
      END IF;
      final_slug := target_org_slug || '-' || attempt;
    END;
  END LOOP;

  INSERT INTO public.profiles (id, org_id, full_name, email, role)
  VALUES (target_user_id, created_org.id, target_full_name, target_email, target_role::public.role);

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (created_org.id, target_user_id, 'owner');

  RETURN QUERY SELECT created_org.id, true;
END;
$$;


--
-- Name: current_app_org_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_org_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.org_id
  FROM public.profiles p
  WHERE p.id = public.current_app_user_id()
  LIMIT 1
$$;


--
-- Name: current_app_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.role::text
  FROM public.profiles p
  WHERE p.id = public.current_app_user_id()
  LIMIT 1
$$;


--
-- Name: current_app_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_app_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_user_id', true), '')::uuid,
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  )
$$;


--
-- Name: is_current_org_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_current_org_member(target_org_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT target_org_id IS NOT NULL
    AND target_org_id = public.current_app_org_id()
$$;


--
-- Name: is_workspace_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_workspace_admin(workspace_id_param uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = workspace_id_param
      AND user_id = public.current_app_user_id()
      AND role IN ('owner', 'admin')
      AND is_active = true
  );
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    email text NOT NULL,
    token text NOT NULL,
    role public.workspace_role DEFAULT 'member'::public.workspace_role NOT NULL,
    invited_by uuid,
    accepted_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status public.invite_status DEFAULT 'pending'::public.invite_status NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    owner_id uuid,
    plan public.plan DEFAULT 'free'::public.plan NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    org_id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    role public.role DEFAULT 'designer'::public.role NOT NULL,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    classification public.classification,
    reframed_problem text,
    extracted_solution text,
    status public.request_status DEFAULT 'open'::public.request_status NOT NULL,
    assigned_to uuid,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role public.workspace_role DEFAULT 'member'::public.workspace_role NOT NULL,
    invited_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (id);


--
-- Name: invites invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (id);


--
-- Name: invites invites_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_token_unique UNIQUE (token);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_unique UNIQUE (slug);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: requests requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_workspace_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_user_id_pk PRIMARY KEY (workspace_id, user_id);


--
-- Name: comments_request_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX comments_request_id_idx ON public.comments USING btree (request_id);


--
-- Name: requests_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requests_created_by_idx ON public.requests USING btree (created_by);


--
-- Name: requests_org_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX requests_org_id_idx ON public.requests USING btree (org_id);


--
-- Name: uq_invite_pending_email_org; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_invite_pending_email_org ON public.invites USING btree (org_id, email) WHERE (status = 'pending'::public.invite_status);


--
-- Name: organizations set_updated_at_organizations; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_organizations BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles set_updated_at_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: requests set_updated_at_requests; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_updated_at_requests BEFORE UPDATE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: comments comments_author_id_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_author_id_profiles_id_fk FOREIGN KEY (author_id) REFERENCES public.profiles(id);


--
-- Name: comments comments_request_id_requests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comments
    ADD CONSTRAINT comments_request_id_requests_id_fk FOREIGN KEY (request_id) REFERENCES public.requests(id) ON DELETE CASCADE;


--
-- Name: invites invites_invited_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_invited_by_profiles_id_fk FOREIGN KEY (invited_by) REFERENCES public.profiles(id);


--
-- Name: invites invites_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: requests requests_assigned_to_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_assigned_to_profiles_id_fk FOREIGN KEY (assigned_to) REFERENCES public.profiles(id);


--
-- Name: requests requests_created_by_profiles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_created_by_profiles_id_fk FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: requests requests_org_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.requests
    ADD CONSTRAINT requests_org_id_organizations_id_fk FOREIGN KEY (org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_organizations_id_fk FOREIGN KEY (workspace_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: comments comments_workspace_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY comments_workspace_access ON public.comments USING ((EXISTS ( SELECT 1
   FROM public.requests r
  WHERE ((r.id = comments.request_id) AND public.is_current_org_member(r.org_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.requests r
  WHERE ((r.id = comments.request_id) AND public.is_current_org_member(r.org_id)))));


--
-- Name: invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

--
-- Name: invites invites_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invites_org_access ON public.invites USING (public.is_current_org_member(org_id)) WITH CHECK (public.is_current_org_member(org_id));


--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations organizations_select_current_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY organizations_select_current_org ON public.organizations FOR SELECT USING ((id = public.current_app_org_id()));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_same_org; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_same_org ON public.profiles FOR SELECT USING (((id = public.current_app_user_id()) OR public.is_current_org_member(org_id)));


--
-- Name: profiles profiles_update_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_self_or_admin ON public.profiles FOR UPDATE TO authenticated USING ((public.is_current_org_member(org_id) AND ((id = public.current_app_user_id()) OR public.is_workspace_admin(org_id)))) WITH CHECK ((public.is_current_org_member(org_id) AND ((id = public.current_app_user_id()) OR public.is_workspace_admin(org_id))));


--
-- Name: requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

--
-- Name: requests requests_org_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY requests_org_access ON public.requests USING (public.is_current_org_member(org_id)) WITH CHECK (public.is_current_org_member(org_id));


--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_members workspace_members_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_members_select_active ON public.workspace_members FOR SELECT TO authenticated USING (((workspace_id = public.current_app_org_id()) AND (is_active = true)));


--
-- Name: workspace_members workspace_members_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_members_update_admin ON public.workspace_members FOR UPDATE TO authenticated USING (((workspace_id = public.current_app_org_id()) AND public.is_workspace_admin(workspace_id) AND (user_id <> public.current_app_user_id()))) WITH CHECK (((workspace_id = public.current_app_org_id()) AND public.is_workspace_admin(workspace_id)));


--
-- PostgreSQL database dump complete
--

-- end of baseline

