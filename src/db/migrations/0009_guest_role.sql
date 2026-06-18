-- 0009: Add 'guest' to workspace_role enum
-- Additive only — no destructive ops. Idempotent via IF NOT EXISTS.
-- Dev and prod share the same Supabase DB (Tokyo), so this applies to both.

ALTER TYPE workspace_role ADD VALUE IF NOT EXISTS 'guest';
