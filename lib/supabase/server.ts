import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Server-side Supabase client using the service_role key.
 *
 * This app authenticates via NextAuth, not Supabase Auth, so there is no
 * Supabase session to bridge via cookies. All server-side data access
 * (Server Components, Route Handlers, the cron pipeline) goes through this
 * client, which bypasses Row Level Security. Authorization is enforced by
 * the NextAuth proxy (see proxy.ts) restricting the app to a single account.
 *
 * Never import this file from a Client Component.
 */
export function createServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
