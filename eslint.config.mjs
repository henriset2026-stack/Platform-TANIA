import next from "eslint-config-next";

/**
 * Secrets that must never be read outside an explicitly server-only module.
 * Enforces CLAUDE.md §12 and AGENTS.md: service-role and provider credentials
 * never reach browser-executed code.
 *
 * The allowlisted paths do not exist yet — they are created in later phases.
 * Until then the rule denies these reads everywhere, which is the safe default.
 */
const SERVER_ONLY_SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENTRA_CLIENT_SECRET",
  "AI_GATEWAY_KEY",
  "JARVIS_API_KEY",
];

const secretGuard = SERVER_ONLY_SECRETS.flatMap((name) => [
  {
    selector: `MemberExpression[property.name='${name}']`,
    message: `${name} is server-only. Read it exclusively in lib/supabase/admin.ts or lib/env.server.ts.`,
  },
  {
    selector: `MemberExpression[computed=true][property.value='${name}']`,
    message: `${name} is server-only. Read it exclusively in lib/supabase/admin.ts or lib/env.server.ts.`,
  },
]);

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "coverage/**",
    ],
  },
  ...next,
  {
    files: ["**/*.{ts,tsx,mjs}"],
    rules: {
      "no-restricted-syntax": ["error", ...secretGuard],
      eqeqeq: ["error", "always"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    // The only modules permitted to read server-only secrets. All import
    // "server-only", so a client component that pulls them in fails the build.
    // lib/ai/config.ts tests AI_GATEWAY_KEY for PRESENCE only and never
    // returns its value.
    files: ["lib/env.server.ts", "lib/supabase/admin.ts", "lib/ai/config.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
  {
    // Tests assert on the secret names themselves.
    files: ["tests/**/*.ts"],
    rules: { "no-restricted-syntax": "off" },
  },
];

export default config;
