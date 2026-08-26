import { beforeEach, describe, expect, it } from 'vitest';
import { useSpaceStore } from '@/store/spaceStore';
import { distanceFromMarker } from '@/xr/markerRelativeTransform';

const MARKER = 'test-marker';

describe('spaceStore', () => {
  beforeEach(() => {
    useSpaceStore.getState().reset();
  });

  it('creates an empty space the first time a marker is seen', () => {
    useSpaceStore.getState().setActiveMarker(MARKER);
    const s = useSpaceStore.getState();
    expect(s.activeMarker).toBe(MARKER);
    expect(s.spaces[MARKER]).toEqual({ markerName: MARKER, assets: [] });
  });

  it('does not wipe an existing space when the marker is seen again', () => {
    const store = useSpaceStore.getState();
    store.setActiveMarker(MARKER);
    store.bindAsset(MARKER, { assetUrl: '/a.png', assetName: 'A' });
    useSpaceStore.getState().setActiveMarker(MARKER);
    expect(useSpaceStore.getState().spaces[MARKER].assets).toHaveLength(1);
  });

  it('binds an asset at the marker origin and selects it', () => {
    const id = useSpaceStore.getState().bindAsset(MARKER, {
      assetUrl: '/a.png',
      assetName: 'A',
    });
    const s = useSpaceStore.getState();
    const asset = s.spaces[MARKER].assets[0];
    expect(asset.id).toBe(id);
    expect(asset.local.position).toEqual([0, 0, 0]);
    expect(asset.local.scale).toBe(1);
    expect(s.selectedAssetId).toBe(id);
  });

  it('gives each binding its own position array', () => {
    const store = useSpaceStore.getState();
    const a = store.bindAsset(MARKER, { assetUrl: '/a.png', assetName: 'A' });
    const b = store.bindAsset(MARKER, { assetUrl: '/b.png', assetName: 'B' });
    useSpaceStore.getState().setDistance(MARKER, a, 0.5);
    const assets = useSpaceStore.getState().spaces[MARKER].assets;
    expect(distanceFromMarker(assets.find((x) => x.id === a)!.local)).toBeCloseTo(0.5);
    // A shared default array would have moved the second asset too.
    expect(distanceFromMarker(assets.find((x) => x.id === b)!.local)).toBe(0);
  });

  it('setDistance changes only the normal axis', () => {
    const id = useSpaceStore.getState().bindAsset(MARKER, {
      assetUrl: '/a.png',
      assetName: 'A',
      local: { position: [0.1, 0.2, 0], quaternion: [0, 0, 0, 1], scale: 1 },
    });
    useSpaceStore.getState().setDistance(MARKER, id, 0.75);
    expect(useSpaceStore.getState().spaces[MARKER].assets[0].local.position).toEqual([
      0.1, 0.2, 0.75,
    ]);
  });

  it('ignores updates for an unknown binding without changing state', () => {
    useSpaceStore.getState().bindAsset(MARKER, { assetUrl: '/a.png', assetName: 'A' });
    const before = useSpaceStore.getState().spaces;
    useSpaceStore.getState().setDistance(MARKER, 'nope', 1);
    expect(useSpaceStore.getState().spaces).toBe(before);
  });

  it('removes a binding and clears the selection when it was selected', () => {
    const id = useSpaceStore.getState().bindAsset(MARKER, { assetUrl: '/a.png', assetName: 'A' });
    useSpaceStore.getState().removeAsset(MARKER, id);
    const s = useSpaceStore.getState();
    expect(s.spaces[MARKER].assets).toHaveLength(0);
    expect(s.selectedAssetId).toBeNull();
  });

  it('keeps spaces separate per marker', () => {
    const store = useSpaceStore.getState();
    store.bindAsset('marker-a', { assetUrl: '/a.png', assetName: 'A' });
    store.bindAsset('marker-b', { assetUrl: '/b.png', assetName: 'B' });
    const s = useSpaceStore.getState();
    expect(s.spaces['marker-a'].assets).toHaveLength(1);
    expect(s.spaces['marker-b'].assets).toHaveLength(1);
  });

  it('findAsset locates a binding across spaces', () => {
    const store = useSpaceStore.getState();
    store.bindAsset('marker-a', { assetUrl: '/a.png', assetName: 'A' });
    const id = store.bindAsset('marker-b', { assetUrl: '/b.png', assetName: 'B' });
    const found = useSpaceStore.getState().findAsset(id);
    expect(found?.markerName).toBe('marker-b');
    expect(found?.asset.assetName).toBe('B');
    expect(useSpaceStore.getState().findAsset('missing')).toBeNull();
  });

  it('hydrate replaces local state rather than merging it', () => {
    useSpaceStore.getState().bindAsset(MARKER, { assetUrl: '/stale.png', assetName: 'stale' });
    useSpaceStore.getState().hydrate([
      {
        markerName: 'from-server',
        assets: [
          {
            id: 'srv-1',
            assetUrl: '/srv.png',
            assetName: 'srv',
            local: { position: [0, 0, 0.4], quaternion: [0, 0, 0, 1], scale: 1 },
          },
        ],
      },
    ]);
    const s = useSpaceStore.getState();
    expect(Object.keys(s.spaces)).toEqual(['from-server']);
    expect(distanceFromMarker(s.spaces['from-server'].assets[0].local)).toBeCloseTo(0.4);
  });
});
