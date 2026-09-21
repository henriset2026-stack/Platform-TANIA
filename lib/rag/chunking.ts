/**
 * Document chunking — TANIA_PRD_v2.0.md §42.
 *
 * Deterministic and pure: the same document always produces the same chunks,
 * with the same offsets. That matters for citations — a citation points at a
 * chunk index and character range, so non-deterministic chunking would make
 * stored citations drift away from the text they quote.
 */

export interface Chunk {
  readonly index: number;
  readonly content: string;
  readonly startOffset: number;
  readonly endOffset: number;
  /** Rough token estimate; see estimateTokens. */
  readonly estimatedTokens: number;
}

export interface ChunkOptions {
  /** Target size in characters. */
  readonly targetChars: number;
  /** Overlap carried into the next chunk, to avoid splitting an idea. */
  readonly overlapChars: number;
  /** Hard ceiling; a chunk longer than this is split regardless of boundaries. */
  readonly maxChars: number;
}

/**
 * Defaults.
 *
 * DESIGNED, not PRD-specified. §42 does not give a chunking strategy, so these
 * are declared here as named constants and should be tuned once a real corpus
 * and embedding model exist. Overlap is ~15% of target: enough that a sentence
 * spanning a boundary is retrievable from either side, small enough that the
 * corpus does not inflate substantially.
 */
export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  targetChars: 1_200,
  overlapChars: 180,
  maxChars: 2_000,
};

/**
 * Estimates tokens from characters.
 *
 * Deliberately crude and deliberately named "estimate": the real count
 * depends on the tokenizer of a model that has not been selected. Used only
 * for budgeting context, never for billing or for a limit that must be exact.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Splits a document into overlapping chunks on natural boundaries.
 *
 * Prefers paragraph breaks, then sentence ends, then whitespace, and only
 * splits mid-word when a single run of text exceeds maxChars. Splitting
 * mid-sentence degrades retrieval because the embedding of half a sentence
 * rarely matches the question it answers.
 */
export function chunkDocument(
  text: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): readonly Chunk[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];

  const target = Math.max(1, options.targetChars);
  const maxChars = Math.max(target, options.maxChars);
  // Overlap must stay below target or the window never advances.
  const overlap = Math.min(Math.max(0, options.overlapChars), target - 1);

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < normalized.length) {
    const idealEnd = Math.min(start + target, normalized.length);
    let end = idealEnd;

    if (idealEnd < normalized.length) {
      const boundary = findBoundary(normalized, start, idealEnd, maxChars);
      end = boundary;
    }

    const content = normalized.slice(start, end).trim();
    if (content.length > 0) {
      chunks.push({
        index,
        content,
        startOffset: start,
        endOffset: end,
        estimatedTokens: estimateTokens(content),
      });
      index += 1;
    }

    if (end >= normalized.length) break;

    const nextStart = end - overlap;
    // Guarantee forward progress even in pathological input.
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}

/**
 * Finds the best split point at or before `idealEnd`.
 *
 * Searches backwards through a bounded window so a document with no
 * whitespace cannot make this quadratic.
 */
function findBoundary(
  text: string,
  start: number,
  idealEnd: number,
  maxChars: number,
): number {
  const searchFloor = Math.max(start + 1, idealEnd - 300);

  const paragraph = text.lastIndexOf("\n\n", idealEnd);
  if (paragraph > searchFloor) return paragraph + 2;

  for (let i = idealEnd; i > searchFloor; i -= 1) {
    const char = text[i - 1];
    const next = text[i];
    if ((char === "." || char === "!" || char === "?") && (next === " " || next === "\n")) {
      return i;
    }
  }

  const space = text.lastIndexOf(" ", idealEnd);
  if (space > searchFloor) return space + 1;

  // No boundary in range: split at the hard ceiling rather than run away.
  return Math.min(start + maxChars, text.length);
}

/** Reassembles chunks, used to verify chunking loses no content. */
export function reconstructFromChunks(chunks: readonly Chunk[]): string {
  if (chunks.length === 0) return "";
  let out = "";
  let covered = 0;
  for (const chunk of chunks) {
    if (chunk.startOffset >= covered) {
      out += chunk.content;
      covered = chunk.endOffset;
    } else if (chunk.endOffset > covered) {
      out += chunk.content.slice(covered - chunk.startOffset);
      covered = chunk.endOffset;
    }
  }
  return out;
}
