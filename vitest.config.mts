import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "@/*" path mapping in tsconfig.json.
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // RLS and e2e suites need a live database / browser and arrive in later
    // phases; they are kept out of the default unit run.
    exclude: ["node_modules/**", ".next/**", "tests/rls/**", "tests/e2e/**"],
  },
});
