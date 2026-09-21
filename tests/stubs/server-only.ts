/**
 * Test stub for the `server-only` package.
 *
 * The real package throws when imported outside a React Server Component.
 * That check is enforced by the Next.js bundler at build time, and
 * `npm run build` is what actually proves no client component imports a
 * server module — this stub does not weaken it, it only allows those modules
 * to be unit tested in a plain Node environment.
 */
export {};
