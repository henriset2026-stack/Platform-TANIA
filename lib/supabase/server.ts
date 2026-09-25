import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicSupabaseConfig } from "@/lib/env.server";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import type { Database } from "@/types/database";

/**
 * Request-scoped Supabase client for Server Components, Server Actions and
 * Route Handlers.
 *
 * Uses the anon key plus the caller's session cookie, so it operates as the
 * signed-in user and RLS applies. This is the default client for all
 * application data access.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = publicSupabaseConfig();

  return createServerClient<Database>(url, anonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh is handled by middleware instead.
        }
      },
    },
  });
}
