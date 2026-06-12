import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Browser Supabase client using the public anon key.
 *
 * RLS policies deny all access to the anon role for an app that doesn't use
 * Supabase Auth (see supabase/migrations/0001_init.sql), so this client is
 * not used for table access. It exists for the repository structure required
 * by SPEC.md Section 2.4 and for any future use of Supabase Realtime/Storage
 * from the client.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
