import { NextResponse, type NextRequest } from "next/server";

import { logger } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * OIDC callback — TANIA_PRD_v2.0.md §9.1 (Entra ID → Supabase Auth → RBAC → RLS).
 *
 * Exchanges the authorization code for a session. No role or permission is
 * read from the provider: authorization is derived server-side from
 * organization_memberships (TANIA_RBAC_RLS_MATRIX.md §8), so a manipulated
 * token cannot grant privileges.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirectParam = searchParams.get("next") ?? "/dashboard";

  // Only same-origin relative paths, to prevent open redirect.
  const next =
    redirectParam.startsWith("/") && !redirectParam.startsWith("//")
      ? redirectParam
      : "/dashboard";

  if (!code) {
    logger.warn("auth.callback_missing_code");
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // No provider detail is echoed back to the client (CLAUDE.md §22).
    logger.error("auth.callback_failed", { message: error.message });
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  logger.info("auth.callback_ok", { next });
  return NextResponse.redirect(`${origin}${next}`);
}
