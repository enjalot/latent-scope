import { describe, it, expect, vi } from 'vitest';

vi.stubEnv('VITE_API_URL', 'http://localhost:5001/api');

const { atlasTileUrl, fetchAtlasStatus, fetchAtlasPlan } = await import('./atlasUrl.js');

describe('atlasTileUrl', () => {
  it('builds the tile URL with column, res, tx, ty and default sheet', () => {
    expect(atlasTileUrl('ds', 'scopes-001', 'image', 128, 1, 2)).toBe(
      'http://localhost:5001/api/datasets/ds/scopes/scopes-001/atlas/sheet?column=image&res=128&tx=1&ty=2&sheet=0'
    );
  });

  it('includes a custom sheet index', () => {
    const url = atlasTileUrl('ds', 'scopes-001', 'image', 256, 0, 3, 2);
    const params = new URL(url).searchParams;
    expect(params.get('res')).toBe('256');
    expect(params.get('tx')).toBe('0');
    expect(params.get('ty')).toBe('3');
    expect(params.get('sheet')).toBe('2');
  });

  it('encodes dataset and scope ids in the path', () => {
    expect(atlasTileUrl('weird/ds', 'sc/ope', 'img', 64, 0, 0)).toContain(
      '/datasets/weird%2Fds/scopes/sc%2Fope/atlas/sheet?'
    );
  });
});

describe('fetchAtlasStatus', () => {
  it('returns {generated:false} on a non-OK response', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 404 }));
    expect(await fetchAtlasStatus('ds', 'scopes-001', 'image')).toEqual({ generated: false });
    vi.unstubAllGlobals();
  });

  it('returns the parsed manifest on success', async () => {
    const manifest = { generated: true, resolutions: [{ num_tiles: 64, tiles: [] }] };
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(manifest) })
    );
    expect(await fetchAtlasStatus('ds', 'scopes-001', 'image')).toEqual(manifest);
    vi.unstubAllGlobals();
  });
});

describe('fetchAtlasPlan', () => {
  it('requests the plan with resolutions + cell size and returns it', async () => {
    let calledUrl = '';
    const plan = { resolutions: [], density: { res: 64, counts: [] }, total_points: 0 };
    vi.stubGlobal('fetch', (url) => {
      calledUrl = url;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(plan) });
    });
    const res = await fetchAtlasPlan('ds', 'scopes-001', 'image', [64, 128, 256], 32);
    expect(res).toEqual(plan);
    const params = new URL(calledUrl).searchParams;
    expect(params.get('resolutions')).toBe('64,128,256');
    expect(params.get('cell_size')).toBe('32');
    vi.unstubAllGlobals();
  });

  it('returns null on a non-OK response', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 400 }));
    expect(await fetchAtlasPlan('ds', 'scopes-001', 'image', [64], 32)).toBeNull();
    vi.unstubAllGlobals();
  });
});
