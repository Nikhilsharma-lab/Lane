import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for private Storage operations.
 * Clerk owns identity; this client must never be used as a second auth system.
 * Server-only. NEVER import this from client code.
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
