import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Live model evaluation (tests/ai-live).
 *
 * Separate from vitest.config.mts because it calls a paid, rate-limited model
 * API and is non-deterministic. Run deliberately, never inside `npm test`;
 * it skips when no provider is configured.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/ai-live/**/*.test.ts"],
    // Two model calls per case plus the pacing delay and a rate-limit retry.
    testTimeout: 180_000,
    fileParallelism: false,
  },
});
