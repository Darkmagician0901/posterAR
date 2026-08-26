import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadImageTargets, resolveImagePath } from '@/xr8/imageTargetData';

/**
 * Stubs global fetch with a URL → response map.
 *
 * @param routes — Maps a URL to either a JSON body or an HTTP status.
 */
function stubFetch(routes: Record<string, unknown | { status: number }>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const hit = routes[url];
      if (hit === undefined) return { ok: false, status: 404 };
      if (typeof hit === 'object' && hit !== null && 'status' in hit) {
        return { ok: false, status: (hit as { status: number }).status };
      }
      return { ok: true, status: 200, json: async () => hit };
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveImagePath', () => {
  it('roots a relative path in the fingerprint directory', () => {
    const out = resolveImagePath({ imagePath: 'marker-luminance.png' }, '/image-targets');
    expect(out.imagePath).toBe('/image-targets/marker-luminance.png');
  });

  it('leaves an absolute path alone', () => {
    const out = resolveImagePath({ imagePath: '/custom/x.png' }, '/image-targets');
    expect(out.imagePath).toBe('/custom/x.png');
  });

  it('leaves a full URL alone', () => {
    const out = resolveImagePath({ imagePath: 'https://cdn.example/x.png' }, '/image-targets');
    expect(out.imagePath).toBe('https://cdn.example/x.png');
  });

  it('passes through a fingerprint with no imagePath', () => {
    const input = { name: 'm' };
    expect(resolveImagePath(input, '/image-targets')).toBe(input);
  });

  it('does not mutate the input', () => {
    const input = { imagePath: 'x.png' };
    resolveImagePath(input, '/image-targets');
    expect(input.imagePath).toBe('x.png');
  });
});

describe('loadImageTargets', () => {
  it('loads listed fingerprints and rewrites their image paths', async () => {
    stubFetch({
      '/image-targets/manifest.json': { targets: ['m.json'] },
      '/image-targets/m.json': { name: 'm', imagePath: 'm-luminance.png', type: 'PLANAR' },
    });
    const { targets, problem } = await loadImageTargets();
    expect(problem).toBeNull();
    expect(targets).toHaveLength(1);
    expect(targets[0].imagePath).toBe('/image-targets/m-luminance.png');
  });

  it('explains a missing manifest instead of throwing', async () => {
    stubFetch({});
    const { targets, problem } = await loadImageTargets();
    expect(targets).toEqual([]);
    expect(problem).toContain('No markers installed');
    expect(problem).toContain('image-target-cli');
  });

  it('explains an empty target list', async () => {
    stubFetch({ '/image-targets/manifest.json': { targets: [] } });
    const { targets, problem } = await loadImageTargets();
    expect(targets).toEqual([]);
    expect(problem).toContain('lists no targets');
  });

  it('keeps the fingerprints that did load and names the ones that did not', async () => {
    stubFetch({
      '/image-targets/manifest.json': { targets: ['good.json', 'gone.json'] },
      '/image-targets/good.json': { name: 'good' },
      '/image-targets/gone.json': { status: 404 },
    });
    const { targets, problem } = await loadImageTargets();
    expect(targets).toHaveLength(1);
    expect(targets[0].name).toBe('good');
    expect(problem).toContain('gone.json');
    expect(problem).toContain('404');
  });

  it('reports a network failure rather than rejecting', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const { targets, problem } = await loadImageTargets();
    expect(targets).toEqual([]);
    expect(problem).toContain('offline');
  });
});
