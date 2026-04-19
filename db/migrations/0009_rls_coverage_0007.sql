-- Enables RLS and adds policies for the 11 tables introduced in migration 0007
-- that were left without coverage. Mirrors the baseline from 0005_brisk_canary:
-- permissive org-member FOR ALL for org-scoped tables; app layer enforces
-- finer-grained role visibility (designer/PM/lead/admin per CLAUDE.md Part 7).
--
-- Pairs with:
--   #34 — fix/security-critical-views-cron  (app-layer org checks)
--   #36 — fix/security-user-session-pooler  (reliable RLS identity)
--
-- SAFE TO MERGE. Does NOT run until `npm run db:push`. Before running against
-- production, confirm DIRECT_DATABASE_URL is set in Vercel (Issue #37).

-- ── Enable RLS on all 11 tables from migration 0007 ────────────────────────

ALTER TABLE public.stickies                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.initiatives              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.published_views          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iterations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iteration_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cycle_requests           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.initiative_requests      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members          ENABLE ROW LEVEL SECURITY;

-- ── Org-scoped: direct org_id column (4 tables) ────────────────────────────

CREATE POLICY "stickies_org_access"
  ON public.stickies FOR ALL TO public
  USING      (public.is_current_org_member(org_id))
  WITH CHECK (public.is_current_org_member(org_id));

CREATE POLICY "cycles_org_access"
  ON public.cycles FOR ALL TO public
  USING      (public.is_current_org_member(org_id))
  WITH CHECK (public.is_current_org_member(org_id));

CREATE POLICY "initiatives_org_access"
  ON public.initiatives FOR ALL TO public
  USING      (public.is_current_org_member(org_id))
  WITH CHECK (public.is_current_org_member(org_id));

CREATE POLICY "published_views_org_access"
  ON public.published_views FOR ALL TO public
  USING      (public.is_current_org_member(org_id))
  WITH CHECK (public.is_current_org_member(org_id));

-- ── Self-scoped: personal user preferences (1 table) ───────────────────────

CREATE POLICY "notification_preferences_self_access"
  ON public.notification_preferences FOR ALL TO public
  USING      (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

-- ── Request-scoped: existing can_access_request helper (4 tables) ──────────

CREATE POLICY "activity_log_request_access"
  ON public.activity_log FOR ALL TO public
  USING      (public.can_access_request(request_id))
  WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "iterations_request_access"
  ON public.iterations FOR ALL TO public
  USING      (public.can_access_request(request_id))
  WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "cycle_requests_request_access"
  ON public.cycle_requests FOR ALL TO public
  USING      (public.can_access_request(request_id))
  WITH CHECK (public.can_access_request(request_id));

CREATE POLICY "initiative_requests_request_access"
  ON public.initiative_requests FOR ALL TO public
  USING      (public.can_access_request(request_id))
  WITH CHECK (public.can_access_request(request_id));

-- ── Iteration-scoped (two-hop: iteration → request) ───────────────────────

CREATE POLICY "iteration_comments_iteration_access"
  ON public.iteration_comments FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.iterations i
      WHERE i.id = iteration_comments.iteration_id
        AND public.can_access_request(i.request_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.iterations i
      WHERE i.id = iteration_comments.iteration_id
        AND public.can_access_request(i.request_id)
    )
  );

-- ── Project-scoped (two-hop: project → org) ───────────────────────────────

CREATE POLICY "project_members_project_org_access"
  ON public.project_members FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id
        AND public.is_current_org_member(p.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_members.project_id
        AND public.is_current_org_member(p.org_id)
    )
  );
