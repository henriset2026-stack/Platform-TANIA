import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * End-to-end suite configuration.
 *
 * These drive a RUNNING TANIA server over HTTP. They are excluded from
 * `npm test` because a suite that quietly skips inside the default run
 * reports green for assertions that never executed.
 *
 *     npm run build && npm start
 *     E2E_BASE_URL=http://localhost:3000 npm run test:e2e
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/e2e/**/*.test.ts"],
    // Real HTTP against a server that may be cold-starting a route.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
