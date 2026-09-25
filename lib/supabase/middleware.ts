import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isApiRoute, isPublicRoute, loginRedirectPath } from "@/lib/auth/routes";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/csp";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import type { Database } from "@/types/database";

/**
 * Refreshes the Supabase session on each request and propagates rotated
 * cookies. Server Components cannot write cookies, so refresh must happen
 * here.
 *
 * This does not authorize anything. It establishes identity; authorization
 * happens at the server boundary and in RLS (CLAUDE.md §4.1).
 */
export async function updateSession(request: NextRequest) {
  // Content-Security-Policy with a per-request nonce (lib/security/csp.ts).
  // It goes on the request so Next.js stamps the nonce onto its own scripts,
  // and on the response so the browser enforces it.
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({ nonce, dev: process.env.NODE_ENV === "development" });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const pass = () => {
    const next = NextResponse.next({ request: { headers: requestHeaders } });
    next.headers.set("Content-Security-Policy", csp);
    return next;
  };

  let response = pass();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // A production deployment missing its Supabase configuration must not
    // serve protected routes with the sign-in gate silently skipped (Gate #3
    // finding G3-09). Development still serves the shell.
    if (process.env.NODE_ENV === "production" && !isPublicRoute(request.nextUrl.pathname)) {
      return NextResponse.json(
        { error: { code: "NOT_CONFIGURED", message: "TANIA is not configured." } },
        { status: 503 },
      );
    }
    return response;
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Carry the refreshed cookies into the headers the page renders with.
        requestHeaders.set("cookie", request.headers.get("cookie") ?? "");
        response = pass();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalidates the JWT with the auth server. getSession() only
  // reads the cookie and must not be trusted for authorization decisions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Authentication gate only. This establishes *who* is calling; *what* they
  // may see is decided at the server boundary and enforced by RLS. A signed-in
  // user reaching a page proves nothing about their access to its data.
  if (!user && !isPublicRoute(request.nextUrl.pathname)) {
    if (isApiRoute(request.nextUrl.pathname)) {
      // Same envelope as the route handlers, so a client parses one shape.
      return NextResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sign in to use TANIA." } },
        { status: 401 },
      );
    }
    const redirectUrl = new URL(
      loginRedirectPath(request.nextUrl.pathname),
      request.url,
    );
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
