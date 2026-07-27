/**
 * markerAnchoredAssets.ts
 *
 * Keeps the 3D scene in step with a marker space: every asset bound to the
 * marker gets a mesh, positioned by multiplying the marker's live world pose
 * by the asset's stored marker-relative transform.
 *
 * It is a reconciler, not a command API — each frame you hand it the current
 * space and the marker's pose, and it works out what to create, move, and
 * destroy. That means store edits (bind an asset, drag the distance slider,
 * delete a binding) need no matching scene calls; the next frame picks them up.
 *
 * Two anchoring modes, because which one is better is exactly what the testbed
 * is meant to find out:
 *
 *   FOLLOW — re-derive the asset's world pose from the marker every frame.
 *     The asset is rigidly stuck to the printed picture, but inherits all of
 *     the tracker's per-frame jitter.
 *   LATCH  — derive the pose once when the marker is (re)acquired, then leave
 *     it to SLAM. Rock steady, but drifts if SLAM's world estimate drifts.
 *
 * Whichever mode is active, an asset is never moved while its marker is out of
 * view: SLAM holds the last pose, which is what makes the asset stay put when
 * you look away.
 */

import { Matrix4 } from 'three';

import type { PosterPlacement } from '@/xr8/posterPlacement';
import { acquirePosterTexture, releasePosterTexture } from '@/xr8/posterTextureCache';
import {
  markerLocalToWorld,
  originDistance,
  type LocalTransform,
} from '@/xr/markerRelativeTransform';
import type { Space } from '@/store/spaceStore';
import { debugTelemetry } from '@/xr/debugTelemetry';

/** Per-frame inputs that change how poses are applied. */
export interface AnchorOptions {
  /** True for FOLLOW mode, false for LATCH mode (see the module header). */
  follow: boolean;
  /**
   * Marker's physical width in metres, when the engine reports one. Assets are
   * sized to match it so "how far is it from the marker" is judged against a
   * known real-world ruler instead of an arbitrary 0.5 m default.
   */
  markerWidth?: number;
}

/** What the reconciler is currently doing with one binding. */
interface Entry {
  /** Id in PosterPlacement, or null while the texture is still decoding. */
  posterId: string | null;
  /** Texture cache key — must be released exactly once. */
  url: string;
  /** True once a world pose has been written (used by LATCH mode). */
  posed: boolean;
  /**
   * The stored transform the current pose was computed from. Store updates are
   * immutable, so an identity check against the live binding is a cheap and
   * exact "has the user moved this?" test — which is what lets LATCH mode
   * still respond to the distance slider without following the marker.
   */
  appliedLocal: LocalTransform | null;
  /** The world transform most recently applied, for drift measurement. */
  applied: Matrix4;
}

/**
 * Reconciles a marker space into three.js meshes. One instance per AR session;
 * call {@link MarkerAnchoredAssets.clear} on teardown.
 */
export class MarkerAnchoredAssets {
  private readonly _placement: PosterPlacement;
  private readonly _entries = new Map<string, Entry>();
  private readonly _tmpMatrix = new Matrix4();
  /** Last marker pose seen, so a late texture decode still has somewhere to go. */
  private _lastMarkerWorld: Matrix4 | null = null;
  /** Set by noteReacquired(); consumed on the next update(). */
  private _pendingReacquire = false;
  private _reacquireDriftMm: number | null = null;

  /**
   * @param placement — The scene's PosterPlacement; this class creates and
   *   removes posters through it rather than touching three.js directly.
   */
  constructor(placement: PosterPlacement) {
    this._placement = placement;
  }

  /**
   * Distance between where an asset sat (held by SLAM) and where the marker
   * says it should sit, measured the moment the marker came back into view.
   *
   * This is the headline stability number: it is the visible "jump" a user
   * would see on re-acquisition, and it is the same quantity that decides
   * whether a scene restored after a cold start lands in the right place.
   *
   * @returns Drift in millimetres, or null before any re-acquisition.
   */
  get reacquireDriftMm(): number | null {
    return this._reacquireDriftMm;
  }

  /** Number of assets currently rendered. */
  get placedCount(): number {
    let n = 0;
    for (const e of this._entries.values()) if (e.posterId) n++;
    return n;
  }

  /**
   * Tells the reconciler the marker has just been re-acquired, so the next
   * update measures drift before it moves anything.
   */
  noteReacquired(): void {
    this._pendingReacquire = true;
  }

  /**
   * Brings the scene in line with `space`. Call once per frame.
   *
   * @param space — The active marker's space, or null when no marker has been
   *   detected yet (in which case only removals are processed).
   * @param markerWorld — The marker's rigid world transform this frame, or
   *   null when the marker is not currently in view.
   * @param options — Anchoring mode and marker size; see {@link AnchorOptions}.
   */
  update(space: Space | null, markerWorld: Matrix4 | null, options: AnchorOptions): void {
    const assets = space?.assets ?? [];

    // ── removals: bindings that vanished from the store ──────────────────
    const live = new Set(assets.map((a) => a.id));
    for (const [id, entry] of this._entries) {
      if (live.has(id)) continue;
      this._destroy(id, entry);
    }

    if (markerWorld) {
      if (this._lastMarkerWorld) this._lastMarkerWorld.copy(markerWorld);
      else this._lastMarkerWorld = markerWorld.clone();
    }

    // Drift is measured against the pose SLAM was holding, so it has to be
    // read BEFORE any pose is rewritten this frame.
    const measuringDrift = this._pendingReacquire && markerWorld !== null;
    if (measuringDrift) this._pendingReacquire = false;
    let worstDriftMm: number | null = null;

    for (const asset of assets) {
      let entry = this._entries.get(asset.id);

      // ── creations: a binding with no mesh yet ──────────────────────────
      if (!entry) {
        entry = {
          posterId: null,
          url: asset.assetUrl,
          posed: false,
          appliedLocal: null,
          applied: new Matrix4(),
        };
        this._entries.set(asset.id, entry);
        void this._load(asset.id, asset.assetUrl, asset.assetName, options.markerWidth);
        continue;
      }

      // A binding whose image changed is torn down and rebuilt: swapping the
      // texture in place would leak the old cache reference and skip the
      // aspect-ratio resize.
      if (entry.url !== asset.assetUrl) {
        this._destroy(asset.id, entry);
        continue;
      }

      if (!entry.posterId || !markerWorld) continue;

      // FOLLOW re-poses every frame. LATCH re-poses only when there is a
      // reason to: the first placement, a re-acquisition, or the user having
      // edited the stored transform.
      const shouldPose =
        options.follow || !entry.posed || measuringDrift || entry.appliedLocal !== asset.local;
      if (!shouldPose) continue;

      const world = markerLocalToWorld(markerWorld, asset.local);
      this._tmpMatrix.fromArray(world);

      if (measuringDrift && entry.posed) {
        const driftMm = originDistance(entry.applied, this._tmpMatrix) * 1000;
        if (worstDriftMm === null || driftMm > worstDriftMm) worstDriftMm = driftMm;
      }

      this._placement.setPose(entry.posterId, world);
      entry.applied.copy(this._tmpMatrix);
      entry.appliedLocal = asset.local;
      entry.posed = true;
    }

    if (worstDriftMm !== null) {
      this._reacquireDriftMm = worstDriftMm;
      debugTelemetry.logEvent(`marker re-acquired: drift ${worstDriftMm.toFixed(1)} mm`);
    }
  }

  /** Removes every mesh and releases every texture reference. */
  clear(): void {
    for (const [id, entry] of this._entries) this._destroy(id, entry);
    this._entries.clear();
    this._lastMarkerWorld = null;
    this._pendingReacquire = false;
    this._reacquireDriftMm = null;
  }

  /**
   * Decodes an asset's texture and places its mesh.
   *
   * Runs off the render loop, so by the time it resolves the binding may
   * already be gone — every path re-checks the entry is still the one that
   * started the load before touching the scene, and releases the texture
   * otherwise.
   *
   * @param bindingId — Store id of the binding being loaded.
   * @param url — Image URL; also the texture-cache key.
   * @param name — Label, used only for diagnostics.
   * @param markerWidth — Marker's physical width in metres, when known.
   */
  private async _load(
    bindingId: string,
    url: string,
    name: string,
    markerWidth?: number,
  ): Promise<void> {
    let acquired;
    try {
      acquired = await acquirePosterTexture(url);
    } catch (err) {
      this._entries.delete(bindingId);
      const msg = err instanceof Error ? err.message : String(err);
      debugTelemetry.logEvent(`marker asset failed: ${name} (${msg})`);
      return;
    }

    const entry = this._entries.get(bindingId);
    // Unbound (or re-bound to a different image) while we were decoding.
    if (!entry || entry.url !== url) {
      releasePosterTexture(url);
      return;
    }

    // No marker pose yet — park the mesh at the world origin; the next update
    // with a visible marker moves it. `posed` stays false so LATCH mode still
    // treats the first real marker pose as its one-time latch.
    const world = new Float32Array((this._lastMarkerWorld ?? new Matrix4()).elements);

    const posterId = this._placement.place(
      world,
      acquired.texture,
      acquired.aspect,
      undefined,
      url,
      acquired.animator,
    );
    // Match the asset's width to the marker's, so distance reads against a
    // real-world ruler rather than an arbitrary default size.
    if (markerWidth && markerWidth > 0) {
      this._placement.setScale(posterId, markerWidth, markerWidth * (acquired.aspect || 1));
    }

    entry.posterId = posterId;
    debugTelemetry.logEvent(`marker asset ready: ${name}`);
  }

  /**
   * Tears down one entry: removes its mesh (which releases the texture) or,
   * if the texture is still decoding, drops the map entry so the load
   * continuation releases it instead.
   *
   * @param bindingId — Store id of the binding.
   * @param entry — Its reconciler state.
   */
  private _destroy(bindingId: string, entry: Entry): void {
    // PosterPlacement.remove() calls releasePosterTexture itself, so releasing
    // here too would double-release and free a texture other posters still use.
    if (entry.posterId) this._placement.remove(entry.posterId);
    this._entries.delete(bindingId);
  }
}
