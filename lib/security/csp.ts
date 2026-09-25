/**
 * Content-Security-Policy (Security Gate #1 finding H-1, closed in Gate #3).
 *
 * A fresh nonce per request, set by the middleware on both the request (so
 * Next.js stamps it onto its own scripts during rendering) and the response.
 * Nonces only work on dynamically rendered pages, so the root layout opts
 * every page into dynamic rendering.
 *
 * Deliberate exceptions, each the narrowest that works:
 *  - style-src 'unsafe-inline': a nonce cannot cover React `style={{…}}`
 *    attributes, and a browser ignores 'unsafe-inline' once a style nonce is
 *    present. Inline styles cannot execute script, so the XSS value of the
 *    policy is carried by script-src.
 *  - 'unsafe-eval' in development only: React's dev tooling needs it.
 *
 * connect-src is 'self' because the browser never talks to Supabase or a
 * model provider directly: sign-in is a server action and the assistant calls
 * /api/ai/chat. Anything that changes that must widen this deliberately.
 */

export interface CspOptions {
  readonly nonce: string;
  readonly dev: boolean;
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy({ nonce, dev }: CspOptions): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}
