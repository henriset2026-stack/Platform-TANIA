import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // RLS and integration suites are added in later phases and need a live
    // database; they are kept out of the default unit run.
    exclude: ["node_modules/**", ".next/**", "tests/rls/**", "tests/e2e/**"],
  },
});
