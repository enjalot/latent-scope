import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

const { imageUrlFor } = await import('./imageUrl.js');

describe('imageUrlFor', () => {
  it('builds the image endpoint URL with column and index', () => {
    expect(imageUrlFor('my-dataset', 'image', 42)).toBe(
      'http://localhost:5001/api/datasets/my-dataset/image?column=image&index=42'
    );
  });

  it('includes size when provided', () => {
    expect(imageUrlFor('my-dataset', 'image', 0, 100)).toBe(
      'http://localhost:5001/api/datasets/my-dataset/image?column=image&index=0&size=100'
    );
  });

  it('omits size when null or undefined', () => {
    expect(imageUrlFor('ds', 'img', 1, null)).not.toContain('size');
    expect(imageUrlFor('ds', 'img', 1, undefined)).not.toContain('size');
  });

  it('encodes odd column names', () => {
    const url = imageUrlFor('ds', 'my image & co?', 3, 100);
    expect(url).toBe(
      'http://localhost:5001/api/datasets/ds/image?column=my+image+%26+co%3F&index=3&size=100'
    );
    const params = new URL(url).searchParams;
    expect(params.get('column')).toBe('my image & co?');
    expect(params.get('index')).toBe('3');
    expect(params.get('size')).toBe('100');
  });

  it('encodes the dataset id in the path', () => {
    expect(imageUrlFor('weird/ds name', 'img', 0)).toContain(
      '/datasets/weird%2Fds%20name/image?'
    );
  });
});
