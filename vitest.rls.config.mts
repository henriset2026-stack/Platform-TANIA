import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * RLS suite configuration.
 *
 * Separate from vitest.config.mts because these tests need a live database
 * and real authenticated sessions — see tests/rls/README.md. They are run
 * deliberately, never as part of `npm test`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/rls/**/*.test.ts"],
    // Policy checks hit the network; the default 5s is too tight.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Fixtures create and delete shared rows.
    fileParallelism: false,
  },
});
