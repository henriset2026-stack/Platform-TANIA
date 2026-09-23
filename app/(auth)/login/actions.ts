"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { resolveSiteUrl, safeNextPath } from "@/lib/auth/site-url";
import { logger } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts Microsoft Entra ID sign-in (TANIA_PRD_v2.0.md §9.1).
 *
 * Supabase's `azure` provider owns the OIDC exchange; the browser comes back
 * to /auth/callback, which trades the code for a session. Nothing here reads
 * a role or scope from the provider — authorization is derived afterwards
 * from organization_memberships, so a manipulated token grants nothing.
 */
export async function signInWithEntra(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get("next"));
  const requestHeaders = await headers();
  const origin = resolveSiteUrl({
    siteUrl: process.env.SITE_URL,
    vercelUrl: process.env.VERCEL_URL,
    forwardedHost: requestHeaders.get("x-forwarded-host"),
    forwardedProto: requestHeaders.get("x-forwarded-proto"),
    host: requestHeaders.get("host"),
  });

  if (!origin) {
    logger.error("auth.signin_no_origin");
    redirect("/login?error=auth_failed");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "azure",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      // Entra returns no email claim without this scope.
      scopes: "email",
    },
  });

  if (error || !data.url) {
    // Provider detail stays in the log, never in the response (CLAUDE.md §22).
    logger.error("auth.signin_failed", { message: error?.message ?? "no authorize url" });
    redirect("/login?error=auth_failed");
  }

  redirect(data.url);
}
