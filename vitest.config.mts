import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "@/*" path mapping in tsconfig.json.
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // `server-only` throws on import outside a React Server Component. It
      // is a BUILD-TIME guard enforced by the Next.js bundler — `npm run
      // build` is what proves a client component cannot import these modules.
      // Stubbing it here lets server modules be unit tested without weakening
      // that guarantee.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // tests/unit, tests/integration, tests/security and tests/ai are hermetic
    // and run here. tests/rls needs a live database and tests/e2e needs a
    // running server, so both are run deliberately by their own scripts —
    // a suite that silently no-ops inside `npm test` would report green for
    // assertions that never executed.
    exclude: ["node_modules/**", ".next/**", "tests/rls/**", "tests/e2e/**"],
  },
});
