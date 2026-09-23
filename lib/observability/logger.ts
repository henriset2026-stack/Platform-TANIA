import "server-only";

import { redact } from "@/lib/observability/redact";

/**
 * Structured server logging.
 *
 * One JSON object per line on stdout/stderr, which is what Vercel's runtime
 * logs (and any log drain behind them) index. Every payload passes through
 * redact() here, at the sink, for the same reason the audit recorder does:
 * there are many call sites and one of them forgetting is enough to put a
 * token in a log nobody can prune.
 *
 * Log events, identifiers and outcomes — never prompts, answers, or tool
 * arguments. Those may carry personal data (CLAUDE.md §24).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function isLevel(value: string): value is LogLevel {
  return value in ORDER;
}

/**
 * LOG_LEVEL wins when it names a level. Otherwise production logs `info` and
 * above, and everything else logs `debug`. An unrecognised LOG_LEVEL falls
 * back rather than silencing logging.
 */
export function resolveLogLevel(
  raw: string | undefined = process.env.LOG_LEVEL,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): LogLevel {
  const candidate = raw?.trim().toLowerCase();
  if (candidate && isLevel(candidate)) return candidate;
  return nodeEnv === "production" ? "info" : "debug";
}

/** Builds the line without writing it, so the format is testable. */
export function formatLogLine(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
  now: Date = new Date(),
): string {
  const { value, redactions } = redact(fields);
  const scrubbed =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return JSON.stringify({
    ...scrubbed,
    // Written last so a caller's field can never overwrite them.
    ts: now.toISOString(),
    level,
    event,
    ...(redactions.length > 0 ? { redactions: redactions.length } : {}),
  });
}

function write(level: LogLevel, event: string, fields?: Record<string, unknown>): void {
  if (ORDER[level] < ORDER[resolveLogLevel()]) return;
  const line = formatLogLine(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  // The one sanctioned console.log: this module is the sink the rule protects.
  // eslint-disable-next-line no-console
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => write("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
} as const;
