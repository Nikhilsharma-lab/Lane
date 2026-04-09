-- RLS baseline for tenant-scoped data.
-- These policies secure authenticated Supabase clients and Realtime subscriptions.
-- Server-side Drizzle queries will only be constrained by these policies when the
-- DB connection role is subject to RLS and request.jwt.claim.sub is populated.

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.current_app_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.org_id
  FROM public.profiles p
  WHERE p.id = public.current_app_user_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role::text
  FROM public.profiles p
  WHERE p.id = public.current_app_user_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_current_org_member(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_org_id IS NOT NULL
    AND target_org_id = public.current_app_org_id()
$$;

CREATE OR REPLACE FUNCTION public.is_current_org_privileged()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_app_role() IN ('lead', 'admin'), false)
$$;

CREATE OR REPLACE FUNCTION public.can_access_request(target_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.requests r
    WHERE r.id = target_request_id
      AND public.is_current_org_member(r.org_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_idea(target_idea_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ideas i
    WHERE i.id = target_idea_id
      AND public.is_current_org_member(i.org_id)
  )
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_ai_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idea_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.figma_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impact_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_context_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_handoff_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.figma_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_confidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impact_retrospectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proactive_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.morning_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "organizations_select_current_org"
ON public.organizations
FOR SELECT
TO authenticated
USING (id = public.current_app_org_id());

CREATE POLICY "profiles_select_same_org"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_current_org_member(org_id));

CREATE POLICY "profiles_update_self_or_admin"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  public.is_current_org_member(org_id)
  AND (id = public.current_app_user_id() OR public.current_app_role() = 'admin')
)
WITH CHECK (
  public.is_current_org_member(org_id)
  AND (id = public.current_app_user_id() OR public.current_app_role() = 'admin')
);

CREATE POLICY "projects_org_access"
ON public.projects
FOR ALL
TO authenticated
USING (public.is_current_org_member(org_id))
WITH CHECK (public.is_current_org_member(org_id));

CREATE POLICY "requests_org_access"
ON public.requests
FOR ALL
TO authenticated
USING (public.is_current_org_member(org_id))
WITH CHECK (public.is_current_org_member(org_id));

CREATE POLICY "request_ai_analysis_request_access"
ON public.request_ai_analysis
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "comments_request_access"
ON public.comments
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "assignments_request_access"
ON public.assignments
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "request_stages_request_access"
ON public.request_stages
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "validation_signoffs_request_access"
ON public.validation_signoffs
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "ideas_org_access"
ON public.ideas
FOR ALL
TO authenticated
USING (public.is_current_org_member(org_id))
WITH CHECK (public.is_current_org_member(org_id));

CREATE POLICY "idea_votes_select_org_idea"
ON public.idea_votes
FOR SELECT
TO authenticated
USING (public.can_access_idea(idea_id));

CREATE POLICY "idea_votes_insert_own_vote"
ON public.idea_votes
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_access_idea(idea_id)
  AND voter_id = public.current_app_user_id()
);

CREATE POLICY "idea_votes_update_own_vote"
ON public.idea_votes
FOR UPDATE
TO authenticated
USING (
  public.can_access_idea(idea_id)
  AND voter_id = public.current_app_user_id()
)
WITH CHECK (
  public.can_access_idea(idea_id)
  AND voter_id = public.current_app_user_id()
);

CREATE POLICY "idea_votes_delete_own_vote"
ON public.idea_votes
FOR DELETE
TO authenticated
USING (
  public.can_access_idea(idea_id)
  AND voter_id = public.current_app_user_id()
);

CREATE POLICY "idea_validations_select_org_idea"
ON public.idea_validations
FOR SELECT
TO authenticated
USING (public.can_access_idea(idea_id));

CREATE POLICY "idea_validations_mutate_privileged"
ON public.idea_validations
FOR ALL
TO authenticated
USING (
  public.can_access_idea(idea_id)
  AND public.is_current_org_privileged()
)
WITH CHECK (
  public.can_access_idea(idea_id)
  AND public.is_current_org_privileged()
);

CREATE POLICY "figma_updates_request_access"
ON public.figma_updates
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "impact_records_request_access"
ON public.impact_records
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "request_context_briefs_request_access"
ON public.request_context_briefs
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "request_handoff_briefs_request_access"
ON public.request_handoff_briefs
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "prediction_confidence_request_access"
ON public.prediction_confidence
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "impact_retrospectives_request_access"
ON public.impact_retrospectives
FOR ALL
TO authenticated
USING (public.can_access_request(request_id))
WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "figma_connections_privileged_org_access"
ON public.figma_connections
FOR ALL
TO authenticated
USING (
  public.is_current_org_member(org_id)
  AND public.is_current_org_privileged()
)
WITH CHECK (
  public.is_current_org_member(org_id)
  AND public.is_current_org_privileged()
);

CREATE POLICY "weekly_digests_org_select"
ON public.weekly_digests
FOR SELECT
TO authenticated
USING (public.is_current_org_member(org_id));

CREATE POLICY "weekly_digests_privileged_mutation"
ON public.weekly_digests
FOR ALL
TO authenticated
USING (
  public.is_current_org_member(org_id)
  AND public.is_current_org_privileged()
)
WITH CHECK (
  public.is_current_org_member(org_id)
  AND public.is_current_org_privileged()
);

CREATE POLICY "proactive_alerts_recipient_access"
ON public.proactive_alerts
FOR SELECT
TO authenticated
USING (
  public.is_current_org_member(org_id)
  AND recipient_id = public.current_app_user_id()
);

CREATE POLICY "proactive_alerts_recipient_update"
ON public.proactive_alerts
FOR UPDATE
TO authenticated
USING (
  public.is_current_org_member(org_id)
  AND recipient_id = public.current_app_user_id()
)
WITH CHECK (
  public.is_current_org_member(org_id)
  AND recipient_id = public.current_app_user_id()
);

CREATE POLICY "morning_briefings_owner_access"
ON public.morning_briefings
FOR SELECT
TO authenticated
USING (
  public.is_current_org_member(org_id)
  AND user_id = public.current_app_user_id()
);

CREATE POLICY "morning_briefings_owner_update"
ON public.morning_briefings
FOR UPDATE
TO authenticated
USING (
  public.is_current_org_member(org_id)
  AND user_id = public.current_app_user_id()
)
WITH CHECK (
  public.is_current_org_member(org_id)
  AND user_id = public.current_app_user_id()
);

CREATE POLICY "invites_privileged_org_access"
ON public.invites
FOR ALL
TO authenticated
USING (
  public.is_current_org_member(org_id)
  AND public.is_current_org_privileged()
)
WITH CHECK (
  public.is_current_org_member(org_id)
  AND public.is_current_org_privileged()
);
