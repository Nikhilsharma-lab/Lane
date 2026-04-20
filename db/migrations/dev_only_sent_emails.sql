-- Dev/test-only: captures outbound emails to a queryable table
-- for e2e tests. Deliberately unnumbered (not 0010+) so
-- drizzle-kit push/migrate on production never picks this up.
-- Applied manually to lane dev; applied in CI after numbered
-- migrations (per .github/workflows/ci.yml sql job pattern when
-- A2b testing is added).
--
-- Same pattern as dev_only_pgtap.sql. Do NOT rename or renumber.

CREATE TABLE IF NOT EXISTS public.sent_emails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address    text NOT NULL,
  subject       text NOT NULL,
  body_html     text NOT NULL,
  template_name text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
