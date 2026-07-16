/**
 * posterTextureCache.ts
 *
 * URL-keyed, refcounted shared texture cache for poster images.
 *
 * "Refcounted" = reference-counted: the cache keeps a counter of how many
 * callers are currently using each URL's texture. Acquiring increments the
 * counter, releasing decrements it, and the texture is only freed when the
 * counter reaches zero — so two posters showing the same image safely share
 * one texture.
 *
 * Every call to acquirePosterTexture(url) MUST be balanced by exactly one
 * call to releasePosterTexture(url). The cache disposes the texture and
 * animator (frees their GPU/CPU memory) only when the last reference is
 * released.
 *
 * The cache stores the in-flight decode *promise*, not just the resolved
 * result, so concurrent acquires of the same URL share a single decode
 * instead of racing past the cache check and leaking the loser's texture.
 *
 * A global animation-byte budget limits how much decoded GIF frame data can
 * accumulate across all distinct animated posters. GIFs that would exceed the
 * remaining budget are silently demoted to a static frame-0 texture.
 */

import type { Texture } from 'three';
import { createPosterTexture, type PosterAnimator, type PosterTexture } from '@/xr8/gifAnimator';

/** What an acquirer receives: a shared texture plus animation metadata. */
export interface AcquiredPoster {
  /** The shared texture. Do NOT dispose directly — call releasePosterTexture. */
  texture: Texture;
  /** Shared per-frame GIF animator; null for static images. */
  animator: PosterAnimator | null;
  /** Aspect ratio (height / width) of the source image. */
  aspect: number;
  /** Present when the GIF was placed as a static frame-0 (decode failed OR over the animation memory budget). */
  fallbackReason?: string;
}

/** Cumulative decoded-frame bytes allowed across ALL distinct animated GIFs.
 *  Tunable; sized to leave headroom for the 8th Wall engine + SLAM + camera. */
export const ANIMATION_BYTE_BUDGET = 64 * 1024 * 1024;

interface CacheEntry {
  /** Outstanding acquire() calls not yet balanced by release(). */
  refs: number;
  /** Shared decode; every acquirer of this URL awaits the same promise. */
  load: Promise<PosterTexture>;
  /**
   * Set once `load` resolves. Needed for disposal — while it is undefined the
   * entry is still decoding and cannot be disposed yet (see releasePosterTexture).
   */
  loaded?: PosterTexture;
}

// Module-singleton state.
const _cache = new Map<string, CacheEntry>();
let _totalBytes = 0;

/**
 * Disposes an entry's GPU/CPU resources, refunds its bytes to the animation
 * budget, and evicts it from the cache. No-op while the entry is still
 * decoding (`loaded` unset) — in that case disposal happens later, inside
 * the load continuation (see acquirePosterTexture).
 *
 * @param url — Cache key the entry was stored under.
 * @param entry — The entry to dispose. Passed explicitly (rather than looked
 *   up) so a stale entry never disposes a newer one stored at the same URL.
 */
function disposeEntry(url: string, entry: CacheEntry): void {
  const loaded = entry.loaded;
  if (!loaded) return;
  loaded.texture.dispose();
  loaded.animator?.dispose();
  _totalBytes -= loaded.decodedBytes;
  // Guard against the slot having been re-populated by a newer entry.
  if (_cache.get(url) === entry) _cache.delete(url);
}

/**
 * Gets a shared poster texture for `url`, decoding on first use and
 * refcounting on subsequent uses. Balance every call with
 * releasePosterTexture(url).
 *
 * Concurrent calls for the same URL are safe: they share one decode and one
 * cache entry. If the decode fails, the entry is evicted so a later acquire
 * can retry, and every waiting caller sees the rejection.
 *
 * @param url — Image URL (the cache key). data: URLs work; the whole string
 *   is the key.
 * @returns Resolves with the shared texture, animator, aspect ratio, and
 *   (for demoted GIFs) the reason animation was skipped.
 * @throws Rejects when the image cannot be decoded or loaded at all; the
 *   failed entry is evicted so the next acquire retries from scratch.
 */
export async function acquirePosterTexture(url: string): Promise<AcquiredPoster> {
  let entry = _cache.get(url);

  if (!entry) {
    // First use: decode the image, passing the remaining byte budget for
    // animations. The entry is inserted *before* awaiting so concurrent
    // acquires find it and share the same decode.
    const remaining = ANIMATION_BYTE_BUDGET - _totalBytes;
    const newEntry: CacheEntry = {
      refs: 0,
      // The success handler below is "the load continuation": the .then()
      // callback attached to the decode promise. It runs once the decode
      // finishes, and is where deferred disposal happens — it re-checks the
      // reference count, and if every acquirer already called release()
      // while the decode was still in flight, it disposes the result here.
      load: createPosterTexture(url, { animationByteBudget: remaining }).then(
        (result) => {
          newEntry.loaded = result;
          _totalBytes += result.decodedBytes;
          // Every reference was released while we were still decoding —
          // nobody owns the result, so free it immediately.
          if (newEntry.refs <= 0) disposeEntry(url, newEntry);
          return result;
        },
        (err: unknown) => {
          // Failed decode: evict so a future acquire can retry.
          if (_cache.get(url) === newEntry) _cache.delete(url);
          throw err;
        },
      ),
    };
    _cache.set(url, newEntry);
    entry = newEntry;
  }

  entry.refs++;
  const result = await entry.load;
  return {
    texture: result.texture,
    animator: result.animator,
    aspect: result.aspect,
    fallbackReason: result.fallbackReason,
  };
}

/**
 * Drops one reference to `url`. When the last reference is released, the
 * texture and animator are disposed and the byte budget is freed. Releasing
 * an entry that is still decoding defers disposal until the decode resolves.
 *
 * @param url — The URL passed to the matching acquirePosterTexture call.
 *   Unknown URLs are ignored.
 */
export function releasePosterTexture(url: string): void {
  const entry = _cache.get(url);
  if (!entry) return;

  entry.refs--;
  // If the decode is still in flight (`loaded` unset), disposeEntry is a
  // no-op here. Disposal then happens in the load continuation — the .then()
  // callback attached to the decode promise in acquirePosterTexture — which
  // re-checks the reference count after the decode resolves and disposes the
  // result there if it is still <= 0.
  if (entry.refs <= 0) {
    disposeEntry(url, entry);
  }
}

/** TEST-ONLY: reset cache state between tests. */
export function __resetPosterTextureCache(): void {
  _cache.clear();
  _totalBytes = 0;
}
