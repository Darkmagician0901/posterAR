/**
 * surfaceSampler.ts
 *
 * Gathers a small grid of 3D points around the screen centre by firing several
 * `XR8.XrController.hitTest` rays (the hit-test accepts arbitrary normalized
 * screen coordinates, not just centre). The resulting point set feeds
 * `fitPlane` (src/xr/planeFit.ts) to recover a surface normal at any
 * orientation — which 8th Wall's single-ray ground-plane hit-test cannot give.
 *
 * 8th Wall-specific: reads the `XR8` global. Guarded so a missing engine or a
 * throwing hit-test yields an empty array rather than an exception.
 */

import { Vector3 } from 'three'

export interface GridSampleOptions {
  /** N for an N×N grid of rays. Default 5 (25 rays). */
  gridSize?: number
  /** Half-extent of the grid in normalized screen units (0..0.5). Default 0.12. */
  spread?: number
}

const HIT_TYPES = ['DETECTED_SURFACE', 'ESTIMATED_SURFACE', 'FEATURE_POINT'] as const

/**
 * Fire the hit-test grid and collect the best world-space point per ray.
 *
 * @param options — Grid density + spread; see {@link GridSampleOptions}.
 * @returns World-space points (one per ray that hit something). Empty when the
 *   engine is unavailable or nothing was hit.
 */
export function sampleSurfacePoints(options: GridSampleOptions = {}): Vector3[] {
  const points: Vector3[] = []
  if (typeof XR8 === 'undefined' || !XR8?.XrController?.hitTest) return points

  const gridSize = options.gridSize ?? 5
  const spread = options.spread ?? 0.12
  const step = gridSize > 1 ? (2 * spread) / (gridSize - 1) : 0

  for (let iy = 0; iy < gridSize; iy++) {
    for (let ix = 0; ix < gridSize; ix++) {
      const x = 0.5 - spread + ix * step
      const y = 0.5 - spread + iy * step

      let results: Xr8HitResult[]
      try {
        results = XR8.XrController.hitTest(x, y, HIT_TYPES) as Xr8HitResult[]
      } catch {
        continue
      }
      if (!results || results.length === 0) continue

      const best: Xr8HitResult =
        results.find((r) => r.type === 'DETECTED_SURFACE') ??
        results.find((r) => r.type === 'ESTIMATED_SURFACE') ??
        results.find((r) => r.type === 'FEATURE_POINT') ??
        results[0]

      const p = best.position
      points.push(new Vector3(p.x, p.y, p.z))
    }
  }

  return points
}
