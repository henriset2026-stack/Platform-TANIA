/**
 * The origin that OAuth sends the browser back to.
 *
 * Supabase only honours a redirect URL on its allow-list, so a wrong origin
 * fails closed at Supabase rather than redirecting anywhere unexpected. It
 * still has to be right for sign-in to work, and on Vercel the right answer
 * differs per environment:
 *
 *   1. SITE_URL — set explicitly for production, where the canonical domain
 *      must win over whichever alias the request arrived on.
 *   2. VERCEL_URL — set by Vercel on every deployment, so previews work
 *      without configuration (the preview pattern must be allow-listed).
 *   3. The request's own forwarded host — local development.
 *
 * Pure, so each branch is unit tested.
 */

export interface SiteUrlInput {
  readonly siteUrl?: string | undefined;
  readonly vercelUrl?: string | undefined;
  readonly forwardedHost?: string | null | undefined;
  readonly forwardedProto?: string | null | undefined;
  readonly host?: string | null | undefined;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function resolveSiteUrl(input: SiteUrlInput): string | null {
  const explicit = input.siteUrl?.trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return stripTrailingSlash(url.origin);
      }
    } catch {
      // A malformed SITE_URL falls through rather than producing a bad redirect.
    }
  }

  const vercel = input.vercelUrl?.trim();
  if (vercel) return `https://${stripTrailingSlash(vercel)}`;

  const host = (input.forwardedHost ?? input.host)?.split(",")[0]?.trim();
  if (!host) return null;
  const proto = input.forwardedProto?.split(",")[0]?.trim() === "https" ? "https" : "http";
  return `${proto}://${host}`;
}

/** Same-origin relative paths only, matching app/auth/callback/route.ts. */
export function safeNextPath(raw: unknown): string {
  return typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//")
    ? raw
    : "/dashboard";
}
