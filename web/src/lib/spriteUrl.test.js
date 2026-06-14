import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

const { spriteUrlFor } = await import('./spriteUrl.js');

describe('spriteUrlFor', () => {
  it('builds the sprite endpoint URL with column, index and default size', () => {
    expect(spriteUrlFor('my-dataset', 'image', 42)).toBe(
      'http://localhost:5001/api/datasets/my-dataset/sprite?column=image&index=42&size=64'
    );
  });

  it('includes a custom size when provided', () => {
    expect(spriteUrlFor('my-dataset', 'image', 0, 128)).toBe(
      'http://localhost:5001/api/datasets/my-dataset/sprite?column=image&index=0&size=128'
    );
  });

  it('encodes odd column names', () => {
    const url = spriteUrlFor('ds', 'my image & co?', 3, 64);
    const params = new URL(url).searchParams;
    expect(params.get('column')).toBe('my image & co?');
    expect(params.get('index')).toBe('3');
    expect(params.get('size')).toBe('64');
  });

  it('encodes the dataset id in the path', () => {
    expect(spriteUrlFor('weird/ds name', 'img', 0)).toContain(
      '/datasets/weird%2Fds%20name/sprite?'
    );
  });
});
