/**
 * Redaction for anything that reaches a log.
 *
 * "Never log API keys, passwords, OAuth tokens, raw secrets" cannot be a rule
 * that call sites remember, because there are dozens of call sites and one
 * forgetting is enough. It is applied HERE, at the sink, over every payload,
 * so a future caller who passes a whole request object gets a redacted row
 * rather than a credential in an append-only table nobody can prune.
 *
 * Two independent passes, because either alone misses real cases:
 *
 *  - by KEY. `{ password: "hunter2" }` is a secret whatever the value looks
 *    like, and "hunter2" matches no pattern.
 *  - by VALUE. `{ note: "curl -H 'Authorization: Bearer eyJhbGci...'" }` has
 *    an innocent key and a live token in it.
 *
 * Redaction is reported, never silent. A row that was scrubbed says so, so a
 * reader can tell "no token here" from "a token was removed here" — and so
 * that a spike in redactions is visible as the incident it usually is.
 */

export const REDACTED = "[redacted]";

/**
 * Key names whose value is never logged, matched case-insensitively as a
 * substring so `stripeApiKey` and `X-Auth-Token` are both caught.
 */
const SECRET_KEY_PATTERNS: readonly RegExp[] = [
  /pass(word|phrase)?/i,
  /secret/i,
  /token/i,
  /credential/i,
  /authorization|auth_header/i,
  /cookie/i,
  /refresh|bearer/i,
  /signature/i,
  /connection_?string|dsn/i,
  /salt/i,
];

/**
 * Name segments that mean "this value is a key".
 *
 * Matched against the key split on separators rather than by regex, because
 * `\bkey\b` does NOT match SUPABASE_SERVICE_ROLE_KEY — underscore is a word
 * character, so there is no boundary before the K. That near-miss would have
 * let the one credential this codebase most cares about through, while
 * `apiKey` was caught. Segment matching also keeps `monkey` and `keyboard`
 * out, which a bare substring would not.
 */
const SECRET_KEY_SEGMENTS = new Set(["key", "keys", "apikey", "sig", "pw"]);

function segmentsOf(key: string): readonly string[] {
  return key
    // camelCase -> camel Case, so apiKey yields "api" and "key".
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 0);
}

function isSecretKeyName(key: string): boolean {
  return segmentsOf(key).some((segment) => SECRET_KEY_SEGMENTS.has(segment));
}

/**
 * Value shapes that are credentials regardless of where they appear.
 *
 * Deliberately conservative about length: a short hex string is probably an
 * id, and redacting ids would make the log useless. The thresholds here
 * target things that are only ever secrets.
 */
export const SECRET_VALUE_PATTERNS: readonly { readonly name: string; readonly re: RegExp }[] = [
  { name: "supabase-secret-key", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/ },
  { name: "bearer", re: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/i },
  { name: "openai-style", re: /\bsk-[A-Za-z0-9]{16,}/ },
  { name: "supabase-service", re: /\bservice_role\b/i },
  { name: "github-token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "aws-access-key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "pem-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "postgres-dsn", re: /\bpostgres(ql)?:\/\/\S+/i },
  { name: "basic-auth-url", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/i },
];

/**
 * Field names carrying employee data a telemetry row does not need.
 *
 * Distinct from secrets and handled the same way. An audit row exists to say
 * who did what to which record; it does not need the person's salary, their
 * review narrative or their home address, and "unnecessary sensitive employee
 * data" is exactly the phrase the requirement uses.
 */
const SENSITIVE_PERSONAL_KEY_PATTERNS: readonly RegExp[] = [
  /salary|compensation|pay_?rate|bonus/i,
  /national_?id|nik\b|passport|tax_?id/i,
  /home_?address|personal_?phone|personal_?email/i,
  /date_?of_?birth|\bdob\b/i,
  /bank_?account|iban/i,
  /medical|health_?condition|disability/i,
  /review_?narrative|manager_?comment|private_?note/i,
];

export interface Redaction {
  /** Dotted path to the value that was removed. */
  readonly path: string;
  readonly rule: "secret_key" | "secret_value" | "sensitive_personal" | "oversized" | "depth";
  /** Which pattern matched, for tuning. Never the value itself. */
  readonly detail: string;
}

export interface RedactionResult {
  readonly value: unknown;
  readonly redactions: readonly Redaction[];
}

export const MAX_DEPTH = 6;
export const MAX_STRING_LENGTH = 2_000;
export const MAX_ARRAY_LENGTH = 50;
export const MAX_KEYS = 60;

function matchesAny(patterns: readonly RegExp[], text: string): RegExp | null {
  return patterns.find((pattern) => pattern.test(text)) ?? null;
}

/** Scrubs a value for logging. Never throws, whatever it is given. */
export function redact(input: unknown): RedactionResult {
  const redactions: Redaction[] = [];
  const seen = new WeakSet<object>();

  function walk(value: unknown, path: string, depth: number): unknown {
    if (depth > MAX_DEPTH) {
      redactions.push({ path, rule: "depth", detail: `deeper than ${MAX_DEPTH}` });
      return REDACTED;
    }

    if (value === null || value === undefined) return value ?? null;

    if (typeof value === "string") {
      const pattern = SECRET_VALUE_PATTERNS.find((entry) => entry.re.test(value));
      if (pattern) {
        redactions.push({ path, rule: "secret_value", detail: pattern.name });
        return REDACTED;
      }
      if (value.length > MAX_STRING_LENGTH) {
        redactions.push({
          path,
          rule: "oversized",
          detail: `${value.length} chars`,
        });
        return `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`;
      }
      return value;
    }

    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function" || typeof value === "symbol") {
      return `[${typeof value}]`;
    }

    if (typeof value === "object") {
      // A cycle would otherwise recurse until the stack gives out, turning a
      // logging call into an outage.
      if (seen.has(value)) return "[circular]";
      seen.add(value);

      if (Array.isArray(value)) {
        const items = value.slice(0, MAX_ARRAY_LENGTH);
        const mapped = items.map((item, index) => walk(item, `${path}[${index}]`, depth + 1));
        if (value.length > MAX_ARRAY_LENGTH) {
          redactions.push({
            path,
            rule: "oversized",
            detail: `${value.length} items, kept ${MAX_ARRAY_LENGTH}`,
          });
        }
        return mapped;
      }

      if (value instanceof Date) return value.toISOString();
      if (value instanceof Error) {
        return walk({ name: value.name, message: value.message }, path, depth + 1);
      }

      const out: Record<string, unknown> = {};
      const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_KEYS);

      for (const [key, child] of entries) {
        const childPath = path ? `${path}.${key}` : key;

        const secretKey = matchesAny(SECRET_KEY_PATTERNS, key);
        if (secretKey || isSecretKeyName(key)) {
          redactions.push({
            path: childPath,
            rule: "secret_key",
            detail: secretKey ? String(secretKey) : "key-segment",
          });
          out[key] = REDACTED;
          continue;
        }

        const personalKey = matchesAny(SENSITIVE_PERSONAL_KEY_PATTERNS, key);
        if (personalKey) {
          redactions.push({
            path: childPath,
            rule: "sensitive_personal",
            detail: String(personalKey),
          });
          out[key] = REDACTED;
          continue;
        }

        out[key] = walk(child, childPath, depth + 1);
      }

      return out;
    }

    return String(value);
  }

  return { value: walk(input, "", 0), redactions };
}

/**
 * Hashes a value for telemetry that must count repeats without storing text.
 *
 * FNV-1a, not a cryptographic hash, and the difference matters: this is for
 * grouping identical queries, not for protecting them. It is used on RAG
 * queries, where the point is that the sentence never lands in a table — a
 * short hash of a guessable query is not a secret, and pretending otherwise
 * would invite storing something that needed real protection.
 */
export function stableHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
