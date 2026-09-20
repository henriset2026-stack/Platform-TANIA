import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicSupabaseConfig, serviceRoleKey } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client. **BYPASSES ROW LEVEL SECURITY.**
 *
 * This is the only module permitted to touch SUPABASE_SERVICE_ROLE_KEY
 * (enforced by eslint.config.mjs). `server-only` makes importing it from a
 * client component a build error.
 *
 * Legitimate uses are narrow — provisioning a profile during SSO callback,
 * scheduled maintenance, migrations. It must never be used to serve a user
 * request that RLS would otherwise deny: that is the "bypass RLS for
 * convenience" prohibition in CLAUDE.md §32, and it silently removes the
 * database as an enforcement layer.
 *
 * Never pass this client into agent or tool code (AGENTS.md §7).
 */
export function createAdminClient() {
  const { url } = publicSupabaseConfig();

  return createSupabaseClient<Database>(url, serviceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
