/**
 * Route protection table.
 *
 * Deny by default: a path is protected unless it appears in PUBLIC_ROUTES.
 * Adding a route to the app therefore protects it automatically, which is the
 * correct failure direction — forgetting to list a route makes it private,
 * not public.
 *
 * Pure so it can be unit tested, and so middleware stays thin.
 */

/** Paths reachable without a session. */
export const PUBLIC_ROUTES: readonly string[] = [
  "/",
  "/login",
  "/auth/callback",
];

/** Prefixes served without authentication (framework and asset paths). */
const PUBLIC_PREFIXES: readonly string[] = [
  "/_next/",
  "/favicon",
  "/auth/",
];

export function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * API paths answer an unauthenticated caller with a 401, never a redirect: a
 * 307 replays a POST against the login page and the client receives HTML
 * with status 200 in place of the JSON error contract.
 */
export function isApiRoute(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/** Where to send an unauthenticated caller, preserving their destination. */
export function loginRedirectPath(pathname: string): string {
  const safe = pathname.startsWith("/") && !pathname.startsWith("//");
  const next = safe ? pathname : "/dashboard";
  return `/login?error=unauthenticated&next=${encodeURIComponent(next)}`;
}
