import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

const { atlasSheetUrl, fetchAtlasStatus } = await import('./atlasUrl.js');

describe('atlasSheetUrl', () => {
  it('builds the atlas sheet URL with column, res and default sheet', () => {
    expect(atlasSheetUrl('ds', 'scopes-001', 'image', 64)).toBe(
      'http://localhost:5001/api/datasets/ds/scopes/scopes-001/atlas/sheet?column=image&res=64&sheet=0'
    );
  });

  it('includes a custom sheet index', () => {
    const url = atlasSheetUrl('ds', 'scopes-001', 'image', 128, 3);
    const params = new URL(url).searchParams;
    expect(params.get('res')).toBe('128');
    expect(params.get('sheet')).toBe('3');
  });

  it('encodes dataset and scope ids in the path', () => {
    expect(atlasSheetUrl('weird/ds', 'sc/ope', 'img', 64)).toContain(
      '/datasets/weird%2Fds/scopes/sc%2Fope/atlas/sheet?'
    );
  });
});

describe('fetchAtlasStatus', () => {
  it('returns {generated:false} on a non-OK response', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 404 }));
    const status = await fetchAtlasStatus('ds', 'scopes-001', 'image');
    expect(status).toEqual({ generated: false });
    vi.unstubAllGlobals();
  });

  it('returns the parsed manifest on success', async () => {
    const manifest = { generated: true, cell_size: 32, resolutions: [{ num_tiles: 64 }] };
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(manifest) })
    );
    const status = await fetchAtlasStatus('ds', 'scopes-001', 'image');
    expect(status).toEqual(manifest);
    vi.unstubAllGlobals();
  });
});
