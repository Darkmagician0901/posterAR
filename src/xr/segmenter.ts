/**
 * segmenter
 *
 * Thin wrapper around @tensorflow-models/deeplab that exposes a
 * surface-segmentation API tailored to the poster app. Our job is to find
 * the dominant wall or floor region in the current camera frame and return
 * its centroid + bounding box so SurfaceLifter can lift it to 3D.
 *
 * Cost notes:
 *   - DeepLabV3-MobileNet at 257×257 input takes ~80–150 ms on iPhone 12+
 *     and ~30–50 ms on a 2021 MacBook with WebGL. We throttle inference to
 *     ~5 Hz from the caller so we don't drain the battery.
 *   - The model is ~10 MB compressed and downloads at runtime. We mark this
 *     in telemetry as 'loading' → 'ready' → 'inferring' so the diagnostic
 *     panel can show a progress story.
 */

// TFJS + DeepLab are heavy (~470 KB gzip) — we dynamic-import them from
// `Segmenter.load()` so the main bundle stays small and desktop / Android
// users never pay the cost.
import { debugTelemetry } from './debugTelemetry';

/** Class ID → friendly label, narrowed to the surfaces we care about. */
export type SurfaceClass = 'wall' | 'floor' | 'ceiling';

export interface SurfaceRegion {
  classId: SurfaceClass;
  /** Centroid in image pixels (origin top-left). */
  centroid: { x: number; y: number };
  /** Axis-aligned bbox in image pixels. */
  bbox: { x: number; y: number; width: number; height: number };
  /** Pixel count covered by this class. */
  area: number;
  /** Fraction of the frame covered (0..1). */
  coverage: number;
}

export interface SegmentResult {
  /** Width / height of the segmentation map (model output size, not source). */
  width: number;
  height: number;
  /** RGBA bytes for the model's class colour map, useful for debug overlay. */
  segmentationMap: Uint8ClampedArray;
  /** Best surface region found in this frame, or null if nothing meaningful. */
  surface: SurfaceRegion | null;
}

interface DeepLabModel {
  segment(
    input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement | ImageData
  ): Promise<{
    legend: Record<string, [number, number, number]>;
    width: number;
    height: number;
    segmentationMap: Uint8ClampedArray;
  }>;
  dispose(): void;
}

/**
 * Minimum coverage to call a region "the surface" — anything below this is
 * noise / a far-away wall edge / motion blur. 4% of the frame area is enough
 * to lift a stable centroid while still rejecting tiny sliver detections.
 */
const MIN_COVERAGE = 0.04;

/** ADE20K class names we look for, in priority order. */
const CLASS_PRIORITY: SurfaceClass[] = ['wall', 'floor', 'ceiling'];

export class Segmenter {
  private readonly model: DeepLabModel;
  private readonly classColors: Map<SurfaceClass, [number, number, number]>;
  private busy = false;

  private constructor(
    model: DeepLabModel,
    classColors: Map<SurfaceClass, [number, number, number]>
  ) {
    this.model = model;
    this.classColors = classColors;
  }

  static async load(): Promise<Segmenter> {
    debugTelemetry.setSubsystem('segmenter', 'loading');
    try {
      const [tf, deeplab] = await Promise.all([
        import('@tensorflow/tfjs'),
        import('@tensorflow-models/deeplab'),
      ]);

      // Force WebGL backend explicitly so iOS Safari doesn't silently fall
      // back to CPU (which would be unusably slow).
      await tf.ready();
      try {
        await tf.setBackend('webgl');
      } catch {
        // Some locked-down Safari builds reject WebGL2; let the load below
        // throw so we surface a clear error to telemetry.
      }

      const model = (await deeplab.load({
        base: 'ade20k',
        quantizationBytes: 2,
      })) as unknown as DeepLabModel;

      // Discover the actual RGB tuples for our target classes by running a
      // single dummy inference — the legend returned only contains classes
      // present in that frame, so we use the canonical ADE20K colormap via
      // a 1×1 black input to force the wall/floor/ceiling entries.
      const colorMap = await loadClassColorMap();

      debugTelemetry.setSubsystem('segmenter', 'ready');
      return new Segmenter(model, colorMap);
    } catch (err) {
      console.error('[segmenter] failed to load DeepLab:', err);
      debugTelemetry.setSubsystem('segmenter', 'error');
      throw err;
    }
  }

  /**
   * Segment a single camera frame. Returns null while a previous segment()
   * call is still in flight so the caller's 5 Hz scheduler never overlaps
   * inferences (which would tank performance and OOM on iOS).
   */
  async segment(
    source: HTMLVideoElement | HTMLCanvasElement
  ): Promise<SegmentResult | null> {
    if (this.busy) return null;
    this.busy = true;
    debugTelemetry.setSubsystem('segmenter', 'inferring');
    try {
      const { width, height, segmentationMap } = await this.model.segment(source);
      const surface = pickSurface(segmentationMap, width, height, this.classColors);
      debugTelemetry.setSubsystem('segmenter', 'ready');
      return { width, height, segmentationMap, surface };
    } catch (err) {
      console.warn('[segmenter] inference failed:', err);
      debugTelemetry.setSubsystem('segmenter', 'error');
      return null;
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    try {
      this.model.dispose();
    } catch {
      // ignore — dispose called during unmount, model may already be gone.
    }
    debugTelemetry.setSubsystem('segmenter', 'idle');
  }
}

/**
 * Convenience wrapper used by IOSARFallback: kicks off model load and writes
 * telemetry. Returns the loaded segmenter or null on failure.
 */
export const loadSegmenter = async (): Promise<Segmenter | null> => {
  try {
    return await Segmenter.load();
  } catch {
    return null;
  }
};

/**
 * The ADE20K colormap entry for class i is well-defined and stable across
 * runs — we hard-code the RGB tuples for the three classes we care about
 * rather than running a probe inference. These match what
 * @tensorflow-models/deeplab emits.
 *
 * ADE20K class indices: wall=0, floor=3, ceiling=5.
 * Colormap uses the bit-shift formula: r = ((i+1) >> 0) & 1 ... etc.
 * The deeplab npm pkg ships the canonical colormap; these values verified
 * against `getColormap('ade20k')` output.
 */
const ADE20K_COLORS: Record<SurfaceClass, [number, number, number]> = {
  wall:    [120, 120, 120],
  floor:   [80, 50, 50],
  ceiling: [120, 120, 80],
};

const loadClassColorMap = async (): Promise<Map<SurfaceClass, [number, number, number]>> => {
  const map = new Map<SurfaceClass, [number, number, number]>();
  for (const cls of CLASS_PRIORITY) {
    map.set(cls, ADE20K_COLORS[cls]);
  }
  return map;
};

/**
 * Walk the RGBA segmentation map and find the best surface region.
 *
 * For each target class, we count pixels matching its color, accumulate
 * bbox + centroid, then pick the largest. Single-pass over the map keeps
 * this well under a millisecond for 257×257 inputs.
 */
const pickSurface = (
  map: Uint8ClampedArray,
  width: number,
  height: number,
  classColors: Map<SurfaceClass, [number, number, number]>
): SurfaceRegion | null => {
  type Accum = {
    classId: SurfaceClass;
    color: [number, number, number];
    sumX: number;
    sumY: number;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    area: number;
  };

  const accums: Accum[] = [];
  for (const cls of CLASS_PRIORITY) {
    const color = classColors.get(cls);
    if (!color) continue;
    accums.push({
      classId: cls,
      color,
      sumX: 0,
      sumY: 0,
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0,
      area: 0,
    });
  }

  const totalPixels = width * height;
  // Step through every 4th byte (RGBA stride).
  for (let i = 0, p = 0; i < map.length; i += 4, p++) {
    const r = map[i];
    const g = map[i + 1];
    const b = map[i + 2];
    const x = p % width;
    const y = (p - x) / width;
    for (const acc of accums) {
      const [cr, cg, cb] = acc.color;
      if (r === cr && g === cg && b === cb) {
        acc.area++;
        acc.sumX += x;
        acc.sumY += y;
        if (x < acc.minX) acc.minX = x;
        if (y < acc.minY) acc.minY = y;
        if (x > acc.maxX) acc.maxX = x;
        if (y > acc.maxY) acc.maxY = y;
        break; // colors are unique per class, no need to check the rest.
      }
    }
  }

  // Pick the largest qualifying class.
  let best: Accum | null = null;
  for (const acc of accums) {
    const coverage = acc.area / totalPixels;
    if (coverage < MIN_COVERAGE) continue;
    if (!best || acc.area > best.area) best = acc;
  }
  if (!best) return null;

  return {
    classId: best.classId,
    centroid: {
      x: best.sumX / best.area,
      y: best.sumY / best.area,
    },
    bbox: {
      x: best.minX,
      y: best.minY,
      width: best.maxX - best.minX,
      height: best.maxY - best.minY,
    },
    area: best.area,
    coverage: best.area / totalPixels,
  };
};
