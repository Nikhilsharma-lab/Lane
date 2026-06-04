-- =========================================================================
-- 0004_comments_rls.sql
-- =========================================================================
-- RLS for the comments table. Workspace members can read and write
-- comments on requests in their workspace. Uses the existing
-- is_current_org_member() helper via a join on requests.org_id.

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_workspace_access"
  ON public.comments
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = comments.request_id
        AND public.is_current_org_member(r.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = comments.request_id
        AND public.is_current_org_member(r.org_id)
    )
  );
