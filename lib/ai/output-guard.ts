import { SECRET_VALUE_PATTERNS } from "@/lib/observability/redact";

/**
 * Output guard — the last check between the model and the user.
 *
 * Model output is untrusted like every other model product. This does not
 * make a model "safe"; it removes two failure classes that are cheap to
 * detect deterministically:
 *
 *  - reproducing internal instructions (the system prompt or the scope
 *    description) — the answer is withheld whole, since a partial echo is
 *    still an echo;
 *  - credential-shaped strings — redacted in place, never truncating the rest.
 *
 * Unsupported claims and fabricated citations are not detectable here. They
 * are handled by design instead: the response's evidence, citations and
 * toolsUsed are built from what actually executed, never from model text.
 */

export const WITHHELD_ANSWER =
  "The answer was withheld because it reproduced internal instructions. Please rephrase your question.";

/** A run this long, copied verbatim from protected text, counts as an echo. */
export const ECHO_WINDOW = 48;

export interface GuardedOutput {
  readonly text: string;
  readonly withheld: boolean;
  readonly redactions: number;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function echoes(output: string, protectedText: string): boolean {
  const haystack = normalize(output);
  const needle = normalize(protectedText);
  if (needle.length < ECHO_WINDOW) return needle.length > 0 && haystack.includes(needle);
  const step = Math.max(1, Math.floor(ECHO_WINDOW / 3));
  for (let i = 0; i + ECHO_WINDOW <= needle.length; i += step) {
    if (haystack.includes(needle.slice(i, i + ECHO_WINDOW))) return true;
  }
  return false;
}

export function guardModelOutput(text: string, protectedTexts: readonly string[]): GuardedOutput {
  if (protectedTexts.some((protectedText) => echoes(text, protectedText))) {
    return { text: WITHHELD_ANSWER, withheld: true, redactions: 0 };
  }

  let redactions = 0;
  let safe = text;
  for (const { re } of SECRET_VALUE_PATTERNS) {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    safe = safe.replace(global, () => {
      redactions += 1;
      return "[redacted]";
    });
  }
  return { text: safe, withheld: false, redactions };
}
