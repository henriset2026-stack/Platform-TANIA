/**
 * Session cookie attributes (Security Gate #3, step 9).
 *
 * @supabase/ssr defaults to httpOnly: false so a browser Supabase client can
 * read the session. TANIA has no browser Supabase client in use (sign-in is a
 * server action; lib/supabase/client.ts has no importer), so the cookies are
 * made HttpOnly: a script injected into the page cannot read the session.
 * Adding a browser client later means revisiting this deliberately.
 *
 * Secure in production so the cookie never travels over plain HTTP; off in
 * development because localhost runs over HTTP. SameSite=Lax keeps the
 * session off cross-site POSTs.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;
