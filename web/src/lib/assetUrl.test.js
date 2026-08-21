import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

const { assetUrlFor } = await import('./assetUrl.js');

describe('assetUrlFor', () => {
  it('encodes a dataset-relative asset path', () => {
    expect(assetUrlFor('my data', 'models/head 1.glb')).toBe(
      'http://localhost:5001/api/files/my%20data/models/head%201.glb'
    );
  });

  it('rejects paths that could leave the dataset directory', () => {
    expect(assetUrlFor('data', '../head.glb')).toBeNull();
    expect(assetUrlFor('data', '/head.glb')).toBeNull();
    expect(assetUrlFor('data', 'models\\head.glb')).toBeNull();
  });
});
