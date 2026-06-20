import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS, has auth.admin access.
 * Server/test-only. NEVER import this from app or client code.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error(
      "[supabase/admin] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set."
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
