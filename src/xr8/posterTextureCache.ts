/**
 * posterTextureCache.ts
 *
 * URL-keyed, refcounted shared texture cache for poster images.
 *
 * Every call to acquirePosterTexture(url) MUST be balanced by exactly one
 * call to releasePosterTexture(url). The cache disposes the texture and
 * animator only when the last reference is released.
 *
 * The cache stores the in-flight decode *promise*, not just the resolved
 * result, so concurrent acquires of the same URL share a single decode
 * instead of racing past the cache check and leaking the loser's texture.
 *
 * A global animation-byte budget limits how much decoded GIF frame data can
 * accumulate across all distinct animated posters. GIFs that would exceed the
 * remaining budget are silently demoted to a static frame-0 texture.
 */

import type { Texture } from 'three'
import { createPosterTexture, type PosterAnimator, type PosterTexture } from '@/xr8/gifAnimator'

export interface AcquiredPoster {
  texture: Texture
  animator: PosterAnimator | null
  aspect: number
  /** Present when the GIF was placed as a static frame-0 (decode failed OR over the animation memory budget). */
  fallbackReason?: string
}

/** Cumulative decoded-frame bytes allowed across ALL distinct animated GIFs.
 *  Tunable; sized to leave headroom for the 8th Wall engine + SLAM + camera. */
export const ANIMATION_BYTE_BUDGET = 64 * 1024 * 1024

interface CacheEntry {
  /** Outstanding acquire() calls not yet balanced by release(). */
  refs: number
  /** Shared decode; every acquirer of this URL awaits the same promise. */
  load: Promise<PosterTexture>
  /**
   * Set once `load` resolves. Needed for disposal — while it is undefined the
   * entry is still decoding and cannot be disposed yet (see releasePosterTexture).
   */
  loaded?: PosterTexture
}

// Module-singleton state.
const _cache = new Map<string, CacheEntry>()
let _totalBytes = 0

/** Dispose an entry's GPU/CPU resources and evict it from the cache. */
function disposeEntry(url: string, entry: CacheEntry): void {
  const loaded = entry.loaded
  if (!loaded) return
  loaded.texture.dispose()
  loaded.animator?.dispose()
  _totalBytes -= loaded.decodedBytes
  // Guard against the slot having been re-populated by a newer entry.
  if (_cache.get(url) === entry) _cache.delete(url)
}

/**
 * Get a shared poster texture for `url`, decoding on first use and refcounting
 * on subsequent uses. Balance every call with releasePosterTexture(url).
 *
 * Concurrent calls for the same URL are safe: they share one decode and one
 * cache entry. If the decode fails, the entry is evicted so a later acquire
 * can retry, and every waiting caller sees the rejection.
 */
export async function acquirePosterTexture(url: string): Promise<AcquiredPoster> {
  let entry = _cache.get(url)

  if (!entry) {
    // First use: decode the image, passing the remaining byte budget for
    // animations. The entry is inserted *before* awaiting so concurrent
    // acquires find it and share the same decode.
    const remaining = ANIMATION_BYTE_BUDGET - _totalBytes
    const newEntry: CacheEntry = {
      refs: 0,
      load: createPosterTexture(url, { animationByteBudget: remaining }).then(
        (result) => {
          newEntry.loaded = result
          _totalBytes += result.decodedBytes
          // Every reference was released while we were still decoding —
          // nobody owns the result, so free it immediately.
          if (newEntry.refs <= 0) disposeEntry(url, newEntry)
          return result
        },
        (err: unknown) => {
          // Failed decode: evict so a future acquire can retry.
          if (_cache.get(url) === newEntry) _cache.delete(url)
          throw err
        },
      ),
    }
    _cache.set(url, newEntry)
    entry = newEntry
  }

  entry.refs++
  const result = await entry.load
  return {
    texture: result.texture,
    animator: result.animator,
    aspect: result.aspect,
    fallbackReason: result.fallbackReason,
  }
}

/**
 * Drop one reference to `url`. When the last reference is released, the
 * texture and animator are disposed and the byte budget is freed. Releasing
 * an entry that is still decoding defers disposal until the decode resolves.
 */
export function releasePosterTexture(url: string): void {
  const entry = _cache.get(url)
  if (!entry) return

  entry.refs--
  // If the decode is still in flight (`loaded` unset), disposeEntry is a
  // no-op here; the load continuation re-checks refs and disposes then.
  if (entry.refs <= 0) {
    disposeEntry(url, entry)
  }
}

/** TEST-ONLY: reset cache state between tests. */
export function __resetPosterTextureCache(): void {
  _cache.clear()
  _totalBytes = 0
}
