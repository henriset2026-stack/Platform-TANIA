import "server-only";

/**
 * Server-only environment access.
 *
 * Importing `server-only` makes it a build error for any client component to
 * pull this module in, so the service-role key cannot reach the browser even
 * by accident — a guarantee the lint rule alone cannot give (CLAUDE.md §6).
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

/** Publishable values. Safe in the browser; read here for server use. */
export function publicSupabaseConfig(): { url: string; anonKey: string } {
  return {
    url: required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    anonKey: required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  };
}

/**
 * Service-role key. Bypasses RLS entirely.
 *
 * The only legitimate callers are trusted server-side operations that cannot
 * be expressed under a user's own authorization — and CLAUDE.md §32 forbids
 * using it to work around RLS for convenience. Every use must be justified
 * and audited.
 */
export function serviceRoleKey(): string {
  return required(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
