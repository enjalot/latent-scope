import { describe, it, expect } from 'vitest';
import { tokenSnippet, cleanTokenString, DEFAULT_SNIPPET_WINDOW } from './tokenSnippet';

describe('cleanTokenString', () => {
  it('strips a leading sentencepiece marker', () => {
    expect(cleanTokenString('▁hello')).toBe('hello');
  });

  it('strips a leading byte-level BPE marker', () => {
    expect(cleanTokenString('Ġworld')).toBe('world');
  });

  it('strips a leading wordpiece continuation marker', () => {
    expect(cleanTokenString('##ing')).toBe('ing');
  });

  it('leaves markers in the middle of the token alone', () => {
    expect(cleanTokenString('a##b')).toBe('a##b');
  });

  it('passes through plain tokens', () => {
    expect(cleanTokenString('[CLS]')).toBe('[CLS]');
    expect(cleanTokenString('token')).toBe('token');
  });

  it('handles null/undefined', () => {
    expect(cleanTokenString(null)).toBe('');
    expect(cleanTokenString(undefined)).toBe('');
  });
});

describe('tokenSnippet', () => {
  const text = 'The quick brown fox jumps over the lazy dog';

  it('windows around a span in the middle of short text without truncation', () => {
    // "brown" is at [10, 15)
    const snippet = tokenSnippet(text, 10, 15, DEFAULT_SNIPPET_WINDOW);
    expect(snippet).toEqual({
      before: 'The quick ',
      match: 'brown',
      after: ' fox jumps over the lazy dog',
      truncatedStart: false,
      truncatedEnd: false,
    });
  });

  it('truncates context on both sides of a long text', () => {
    const long = 'a'.repeat(500) + 'TOKEN' + 'b'.repeat(500);
    const snippet = tokenSnippet(long, 500, 505, 150);
    expect(snippet.match).toBe('TOKEN');
    expect(snippet.before).toBe('a'.repeat(150));
    expect(snippet.after).toBe('b'.repeat(150));
    expect(snippet.truncatedStart).toBe(true);
    expect(snippet.truncatedEnd).toBe(true);
  });

  it('handles a span at the very start of the text', () => {
    const snippet = tokenSnippet(text, 0, 3, 150);
    expect(snippet.before).toBe('');
    expect(snippet.match).toBe('The');
    expect(snippet.truncatedStart).toBe(false);
  });

  it('handles a span at the very end of the text', () => {
    const snippet = tokenSnippet(text, text.length - 3, text.length, 150);
    expect(snippet.match).toBe('dog');
    expect(snippet.after).toBe('');
    expect(snippet.truncatedEnd).toBe(false);
  });

  it('returns null for -1/-1 spans (tokens with no surface form)', () => {
    expect(tokenSnippet(text, -1, -1, 150)).toBeNull();
  });

  it('returns null when the span starts beyond the text length', () => {
    expect(tokenSnippet(text, text.length + 10, text.length + 15, 150)).toBeNull();
    expect(tokenSnippet(text, text.length, text.length + 5, 150)).toBeNull();
  });

  it('clamps a span that ends beyond the text length', () => {
    const snippet = tokenSnippet(text, text.length - 3, text.length + 50, 150);
    expect(snippet.match).toBe('dog');
    expect(snippet.after).toBe('');
    expect(snippet.truncatedEnd).toBe(false);
  });

  it('returns null for inverted spans', () => {
    expect(tokenSnippet(text, 10, 5, 150)).toBeNull();
  });

  it('returns null for non-string text', () => {
    expect(tokenSnippet(null, 0, 3, 150)).toBeNull();
    expect(tokenSnippet(undefined, 0, 3, 150)).toBeNull();
    expect(tokenSnippet(42, 0, 3, 150)).toBeNull();
  });

  it('returns null for non-integer spans', () => {
    expect(tokenSnippet(text, null, 3, 150)).toBeNull();
    expect(tokenSnippet(text, 0, undefined, 150)).toBeNull();
  });

  it('supports a zero-width span (empty match, context intact)', () => {
    const snippet = tokenSnippet(text, 4, 4, 150);
    expect(snippet.match).toBe('');
    expect(snippet.before).toBe('The ');
  });

  it('uses the default window when none is given', () => {
    const long = 'x'.repeat(400) + 'Y' + 'x'.repeat(400);
    const snippet = tokenSnippet(long, 400, 401);
    expect(snippet.before.length).toBe(DEFAULT_SNIPPET_WINDOW);
    expect(snippet.after.length).toBe(DEFAULT_SNIPPET_WINDOW);
  });
});
