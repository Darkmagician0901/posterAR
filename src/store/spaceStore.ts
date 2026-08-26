/**
 * spaceStore — Zustand store for marker-anchored "spaces".
 *
 * A SPACE is one image marker plus everything bound to it. The marker is the
 * space's origin: every asset in it is stored as a transform relative to the
 * marker (see @/xr/markerRelativeTransform), never as a world position. That
 * is what lets a placement survive quitting the app — world coordinates are
 * re-invented by SLAM on every launch, but "12 cm out from THIS printed
 * picture" is a fact about the physical room.
 *
 * Several spaces coexist, keyed by marker name, so the same session can hold
 * separate arrangements around separate markers.
 *
 * This store is the in-memory source of truth. Persisting to the API is done
 * by the caller (see @/services/spaceApi) rather than inside the store, which
 * keeps the store synchronous and testable, and mirrors how posterStore leaves
 * uploads to usePosterUpload.
 *
 * Despite the `use*` name it is a store, not a hook — call it anywhere.
 */

import { create } from 'zustand';
import {
  IDENTITY_LOCAL,
  withDistanceFromMarker,
  type LocalTransform,
} from '@/xr/markerRelativeTransform';

/** One asset bound to a marker, positioned in that marker's frame. */
export interface BoundAsset {
  /** Stable id (UUID) — also the primary key server-side. */
  id: string;
  /** Image URL the asset renders from (data: URL, or a persisted asset URL). */
  assetUrl: string;
  /** Human-readable label for the HUD. */
  assetName: string;
  /** Placement relative to the marker. */
  local: LocalTransform;
}

/** One marker and everything anchored to it. */
export interface Space {
  /** Image-target name — the space's id AND its coordinate origin. */
  markerName: string;
  assets: BoundAsset[];
}

interface SpaceState {
  /** All spaces, keyed by marker name. */
  spaces: Record<string, Space>;
  /** Marker most recently seen by the camera, or null before any detection. */
  activeMarker: string | null;
  /** Asset the distance slider currently edits, or null. */
  selectedAssetId: string | null;

  /**
   * Marks a marker as the one being worked on, creating its (empty) space on
   * first sight. Called from the `imagefound` handler.
   *
   * @param markerName — Image-target name.
   */
  setActiveMarker: (markerName: string) => void;

  /**
   * Binds a new asset to a marker's space and selects it.
   *
   * @param markerName — Space to bind into; created if it does not exist.
   * @param asset — Image URL and label. `local` defaults to the marker origin
   *   (the asset sits directly on the printed picture).
   * @returns The new binding's id.
   */
  bindAsset: (
    markerName: string,
    asset: { assetUrl: string; assetName: string; local?: LocalTransform },
  ) => string;

  /**
   * Replaces an asset's marker-relative transform.
   *
   * @param markerName — Space the asset belongs to.
   * @param assetId — Binding to update; unknown ids are a no-op.
   * @param local — The new placement.
   */
  setLocal: (markerName: string, assetId: string, local: LocalTransform) => void;

  /**
   * Moves an asset along the marker's normal, leaving everything else alone.
   * This is what the distance slider drives.
   *
   * @param markerName — Space the asset belongs to.
   * @param assetId — Binding to move; unknown ids are a no-op.
   * @param distance — Distance out of the marker's surface, in metres.
   */
  setDistance: (markerName: string, assetId: string, distance: number) => void;

  /**
   * Unbinds an asset from its space.
   *
   * @param markerName — Space the asset belongs to.
   * @param assetId — Binding to remove; unknown ids are a no-op.
   */
  removeAsset: (markerName: string, assetId: string) => void;

  /**
   * Sets which binding the slider edits.
   *
   * @param assetId — Binding id, or null to deselect.
   */
  selectAsset: (assetId: string | null) => void;

  /**
   * Replaces local state with spaces fetched from the server on startup.
   * A straight replace (not a merge): the server is authoritative at boot,
   * and merging would resurrect bindings deleted on another device.
   *
   * @param spaces — Spaces from `listSpaces()`.
   */
  hydrate: (spaces: Space[]) => void;

  /**
   * Looks up a binding across all spaces. Does not change state.
   *
   * @param assetId — Binding id.
   * @returns The binding and its marker name, or null when not found.
   */
  findAsset: (assetId: string) => { markerName: string; asset: BoundAsset } | null;

  /** Empties every space and clears the active/selected pointers. */
  reset: () => void;
}

/**
 * Generates a binding id. A UUID (rather than the `poster-<ts>-<rand>` style
 * used elsewhere) because the server stores it in a `uuid` primary key.
 *
 * @returns A new UUID string.
 */
const generateBindingId = (): string => crypto.randomUUID();

/**
 * Applies `fn` to one asset inside one space, returning new objects the whole
 * way down so Zustand subscribers see a changed reference.
 *
 * @param spaces — Current spaces map.
 * @param markerName — Space to touch.
 * @param assetId — Asset to replace.
 * @param fn — Produces the replacement asset.
 * @returns A new spaces map, or the original when nothing matched (so an
 *   update for an unknown id does not trigger a pointless re-render).
 */
function mapAsset(
  spaces: Record<string, Space>,
  markerName: string,
  assetId: string,
  fn: (asset: BoundAsset) => BoundAsset,
): Record<string, Space> {
  const space = spaces[markerName];
  if (!space) return spaces;
  let changed = false;
  const assets = space.assets.map((a) => {
    if (a.id !== assetId) return a;
    changed = true;
    return fn(a);
  });
  if (!changed) return spaces;
  return { ...spaces, [markerName]: { ...space, assets } };
}

export const useSpaceStore = create<SpaceState>((set, get) => ({
  spaces: {},
  activeMarker: null,
  selectedAssetId: null,

  setActiveMarker: (markerName) => {
    set((state) => ({
      activeMarker: markerName,
      spaces: state.spaces[markerName]
        ? state.spaces
        : { ...state.spaces, [markerName]: { markerName, assets: [] } },
    }));
  },

  bindAsset: (markerName, asset) => {
    const id = generateBindingId();
    const binding: BoundAsset = {
      id,
      assetUrl: asset.assetUrl,
      assetName: asset.assetName,
      // Default to the marker origin: the asset appears sitting on the
      // picture, and the slider is what lifts it off.
      local: asset.local ?? { ...IDENTITY_LOCAL, position: [...IDENTITY_LOCAL.position] },
    };
    set((state) => {
      const space = state.spaces[markerName] ?? { markerName, assets: [] };
      return {
        spaces: {
          ...state.spaces,
          [markerName]: { ...space, assets: [...space.assets, binding] },
        },
        selectedAssetId: id,
      };
    });
    return id;
  },

  setLocal: (markerName, assetId, local) => {
    set((state) => ({
      spaces: mapAsset(state.spaces, markerName, assetId, (a) => ({ ...a, local })),
    }));
  },

  setDistance: (markerName, assetId, distance) => {
    set((state) => ({
      spaces: mapAsset(state.spaces, markerName, assetId, (a) => ({
        ...a,
        local: withDistanceFromMarker(a.local, distance),
      })),
    }));
  },

  removeAsset: (markerName, assetId) => {
    set((state) => {
      const space = state.spaces[markerName];
      if (!space) return state;
      return {
        spaces: {
          ...state.spaces,
          [markerName]: { ...space, assets: space.assets.filter((a) => a.id !== assetId) },
        },
        selectedAssetId: state.selectedAssetId === assetId ? null : state.selectedAssetId,
      };
    });
  },

  selectAsset: (assetId) => set({ selectedAssetId: assetId }),

  hydrate: (spaces) => {
    const next: Record<string, Space> = {};
    for (const s of spaces) next[s.markerName] = s;
    set({ spaces: next });
  },

  findAsset: (assetId) => {
    for (const space of Object.values(get().spaces)) {
      const asset = space.assets.find((a) => a.id === assetId);
      if (asset) return { markerName: space.markerName, asset };
    }
    return null;
  },

  reset: () => set({ spaces: {}, activeMarker: null, selectedAssetId: null }),
}));
