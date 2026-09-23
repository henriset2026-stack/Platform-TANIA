/**
 * Response headers applied to every route.
 *
 * Deliberately excludes Content-Security-Policy. A correct CSP for Next needs
 * per-request nonces wired through middleware, and a wrong one fails at
 * runtime in the browser rather than at build time — which cannot be verified
 * here, since this environment has no browser. Shipping a CSP that silently
 * breaks rendering would be worse than shipping none, so it is recorded as an
 * open finding instead of guessed at.
 *
 * Everything below is inert with respect to rendering: it cannot break a page.
 */
const securityHeaders = [
  // Talent and performance records must not be framed by another origin.
  // CSP frame-ancestors is the modern form and arrives with the CSP above.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a response being reinterpreted as a type it did not declare.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // A talent URL carries a person's id; do not leak it to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here needs these. Voice input (PRD §86) is not built; whoever
  // builds it must relax `microphone` deliberately rather than find it
  // already open.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  // Two years, subdomains included. Only honoured over HTTPS, so it is inert
  // in local development.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fail the production build on type errors rather than shipping them.
  // (Next 16 removed the `eslint` config key; linting runs via `npm run lint`.)
  typescript: { ignoreBuildErrors: false },
  // Do not advertise the framework and its version to an attacker.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
