/**
 * ambientProbe.ts — derive an approximate ambient light color from the live
 * camera feed and expose it for tinting posters.
 *
 * 8th Wall (XR8) has no native light estimation, so we sample a tiny
 * downsampled camera frame (via XR8.CameraPixelArray) and reduce it to a
 * single smoothed color. Multiplying that color into a poster's material makes
 * the poster track the room's brightness and color cast instead of glowing at
 * full brightness like a sticker.
 *
 * `estimateAmbient` is pure (no three.js / DOM / engine dependency) and unit
 * tested. The engine wiring lives below it.
 */

/** Ambient color, each channel in [0, 1]. */
export interface AmbientColor {
  r: number
  g: number
  b: number
}

/** Tuning knobs for {@link estimateAmbient}; all optional with sane defaults. */
export interface EstimateOptions {
  /** Luma (0–255) at/below which brightness hits its floor. Default 30. */
  lumaInMin?: number
  /** Luma (0–255) at/above which brightness hits its ceiling. Default 200. */
  lumaInMax?: number
  /** Brightness floor — how dark a poster may get. Default 0.6. */
  brightMin?: number
  /** Brightness ceiling. Default 1.0. */
  brightMax?: number
  /** 0 = ignore color cast (neutral), 1 = full cast. Default 0.5. */
  castStrength?: number
  /** Exponential-moving-average weight of the new sample. Default 0.1. */
  ema?: number
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v

/**
 * Reduce a downsampled RGBA frame to a single smoothed ambient color.
 *
 * @param pixels — RGBA bytes (stride 4), as produced by XR8.CameraPixelArray
 *   with `luminance: false`.
 * @param pixelCount — Number of pixels (rows × cols). When 0, `prev` is
 *   returned unchanged.
 * @param prev — Previous ambient color, for EMA smoothing.
 * @param opts — Optional tuning knobs.
 * @returns The new smoothed ambient color.
 */
export function estimateAmbient(
  pixels: Uint8Array | Uint8ClampedArray,
  pixelCount: number,
  prev: AmbientColor,
  opts: EstimateOptions = {},
): AmbientColor {
  if (pixelCount <= 0) return prev

  const lumaInMin = opts.lumaInMin ?? 30
  const lumaInMax = opts.lumaInMax ?? 200
  const brightMin = opts.brightMin ?? 0.6
  const brightMax = opts.brightMax ?? 1.0
  const castStrength = opts.castStrength ?? 0.5
  const ema = opts.ema ?? 0.1

  let sumR = 0
  let sumG = 0
  let sumB = 0
  for (let i = 0; i < pixelCount; i++) {
    const o = i * 4
    sumR += pixels[o]
    sumG += pixels[o + 1]
    sumB += pixels[o + 2]
  }
  const avgR = sumR / pixelCount
  const avgG = sumG / pixelCount
  const avgB = sumB / pixelCount

  const luma = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB

  // Brightness: linearly map luma from [lumaInMin, lumaInMax] into
  // [brightMin, brightMax], clamped at both ends.
  const t = clamp((luma - lumaInMin) / (lumaInMax - lumaInMin), 0, 1)
  const brightness = brightMin + (brightMax - brightMin) * t

  // Color cast: per-channel ratio to luma gives a white-balance tint centered
  // on 1.0; pull it toward neutral by castStrength so it stays subtle.
  let castR = 1
  let castG = 1
  let castB = 1
  if (luma > 0) {
    castR = 1 + (avgR / luma - 1) * castStrength
    castG = 1 + (avgG / luma - 1) * castStrength
    castB = 1 + (avgB / luma - 1) * castStrength
  }

  const target: AmbientColor = {
    r: clamp(castR * brightness, 0, 1),
    g: clamp(castG * brightness, 0, 1),
    b: clamp(castB * brightness, 0, 1),
  }

  return {
    r: prev.r + (target.r - prev.r) * ema,
    g: prev.g + (target.g - prev.g) * ema,
    b: prev.b + (target.b - prev.b) * ema,
  }
}
