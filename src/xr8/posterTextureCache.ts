/**
 * posterTextureCache.ts
 *
 * URL-keyed, refcounted shared texture cache for poster images.
 *
 * Every call to acquirePosterTexture(url) MUST be balanced by exactly one
 * call to releasePosterTexture(url). The cache disposes the texture and
 * animator only when the last reference is released.
 *
 * A global animation-byte budget limits how much decoded GIF frame data can
 * accumulate across all distinct animated posters. GIFs that would exceed the
 * remaining budget are silently demoted to a static frame-0 texture.
 */

import type { Texture } from 'three'
import { createPosterTexture, type PosterAnimator } from '@/xr8/gifAnimator'

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
  texture: Texture
  animator: PosterAnimator | null
  aspect: number
  fallbackReason?: string
  /** Decoded animation bytes counted against the global budget (0 for static). */
  bytes: number
  refs: number
}

// Module-singleton state.
const _cache = new Map<string, CacheEntry>()
let _totalBytes = 0

/**
 * Get a shared poster texture for `url`, decoding on first use and refcounting
 * on subsequent uses. Balance every call with releasePosterTexture(url).
 */
export async function acquirePosterTexture(url: string): Promise<AcquiredPoster> {
  const existing = _cache.get(url)
  if (existing) {
    existing.refs++
    return {
      texture: existing.texture,
      animator: existing.animator,
      aspect: existing.aspect,
      fallbackReason: existing.fallbackReason,
    }
  }

  // First use: decode the image, passing the remaining byte budget for animations.
  const remaining = ANIMATION_BYTE_BUDGET - _totalBytes
  const result = await createPosterTexture(url, { animationByteBudget: remaining })

  _totalBytes += result.decodedBytes

  _cache.set(url, {
    texture: result.texture,
    animator: result.animator,
    aspect: result.aspect,
    fallbackReason: result.fallbackReason,
    bytes: result.decodedBytes,
    refs: 1,
  })

  return {
    texture: result.texture,
    animator: result.animator,
    aspect: result.aspect,
    fallbackReason: result.fallbackReason,
  }
}

/**
 * Drop one reference to `url`. When the last reference is released, the
 * texture and animator are disposed and the byte budget is freed.
 */
export function releasePosterTexture(url: string): void {
  const entry = _cache.get(url)
  if (!entry) return

  entry.refs--
  if (entry.refs <= 0) {
    entry.texture.dispose()
    entry.animator?.dispose()
    _totalBytes -= entry.bytes
    _cache.delete(url)
  }
}

/** TEST-ONLY: reset cache state between tests. */
export function __resetPosterTextureCache(): void {
  _cache.clear()
  _totalBytes = 0
}
