/**
 * Pure helpers for token-scope display (granularity: "tokens"): cleaning
 * tokenizer surface forms and windowing a parent document's text around a
 * token's character span. Kept free of React so the logic is unit-testable
 * (see tokenSnippet.test.js); FilterDataTable renders the result as spans.
 */

export const DEFAULT_SNIPPET_WINDOW = 150;

/**
 * Strip tokenizer prefixes from a token's surface string for display:
 * sentencepiece "▁", byte-level BPE "Ġ", and wordpiece "##".
 */
export function cleanTokenString(tokenStr) {
  if (tokenStr === null || tokenStr === undefined) return '';
  return String(tokenStr).replace(/^(?:##|▁|Ġ)+/, '');
}

/**
 * Window `text` around the [charStart, charEnd) span of a token.
 *
 * Returns { before, match, after, truncatedStart, truncatedEnd } where
 * before/after are up to `window` characters of context on each side and
 * truncatedStart/truncatedEnd flag whether text was cut off (so the caller
 * can render ellipses).
 *
 * Returns null when there is nothing to highlight — the token has no surface
 * form (char_start of -1, e.g. CLS/SEP/marker tokens), the span is malformed
 * or beyond the text, or `text` is not a string — so callers can fall back to
 * rendering the plain text.
 */
export function tokenSnippet(text, charStart, charEnd, window = DEFAULT_SNIPPET_WINDOW) {
  if (typeof text !== 'string') return null;
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return null;
  // -1/-1 marks tokens with no surface form; also reject inverted spans.
  if (charStart < 0 || charEnd < charStart) return null;
  // Span starts beyond the text: safe fallback rather than an empty highlight.
  if (charStart >= text.length) return null;

  const start = charStart;
  const end = Math.min(charEnd, text.length);
  const beforeStart = Math.max(0, start - window);
  const afterEnd = Math.min(text.length, end + window);

  return {
    before: text.slice(beforeStart, start),
    match: text.slice(start, end),
    after: text.slice(end, afterEnd),
    truncatedStart: beforeStart > 0,
    truncatedEnd: afterEnd < text.length,
  };
}
