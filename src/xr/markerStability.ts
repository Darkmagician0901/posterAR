/**
 * markerStability.ts
 *
 * Turns a stream of marker poses into the numbers the testbed exists to
 * produce: how fast the engine is reporting the marker, and how much the
 * reported pose wobbles while the marker is physically still.
 *
 * "Jitter" here is deliberately measured against the WINDOW MEAN rather than
 * against the previous sample. Frame-to-frame difference conflates two very
 * different things — genuine hand movement (large, smooth, and expected) and
 * tracking noise (small, zero-mean, and the thing we care about). Deviation
 * from a short rolling mean isolates the noise: hold the phone still and the
 * mean converges on the true pose, so the residual IS the noise floor.
 *
 * Pure and allocation-light: no three.js, no engine globals, no DOM. The
 * caller feeds it samples; it never reads a clock of its own, so tests can
 * drive time explicitly.
 */

/** One reported marker pose, timestamped by the caller. */
export interface StabilitySample {
  /** Timestamp in milliseconds (`performance.now()` in the render loop). */
  t: number;
  /** Marker origin in world space, in metres. */
  position: { x: number; y: number; z: number };
  /** Marker orientation in world space, as a quaternion. */
  rotation: { x: number; y: number; z: number; w: number };
}

/** The rolled-up stability readout, refreshed on every `read()`. */
export interface StabilityMetrics {
  /** How many samples are inside the current window. */
  samples: number;
  /** Pose updates per second across the window (0 until 2 samples land). */
  updateHz: number;
  /**
   * RMS deviation of position from the window mean, in MILLIMETRES.
   * Sub-millimetre is excellent; a few millimetres is normal handheld noise;
   * centimetres means the marker is tracking poorly.
   */
  positionJitterMm: number;
  /** RMS angular deviation from the window's mean orientation, in DEGREES. */
  rotationJitterDeg: number;
  /** Largest single-sample position deviation in the window, in millimetres. */
  positionPeakMm: number;
}

/** Metrics for an empty window — also what `read()` returns before any sample. */
const EMPTY: StabilityMetrics = {
  samples: 0,
  updateHz: 0,
  positionJitterMm: 0,
  rotationJitterDeg: 0,
  positionPeakMm: 0,
};

/** Default rolling-window length. Long enough to average out per-frame noise,
 *  short enough that the readout still responds while you watch it. */
export const DEFAULT_WINDOW_MS = 2000;

/** Accumulates marker poses and reports rolling stability metrics. */
export interface StabilityTracker {
  /**
   * Adds one pose sample and drops any now outside the rolling window.
   *
   * @param sample — The pose and its timestamp.
   */
  add(sample: StabilitySample): void;
  /**
   * Computes the current metrics over the retained window.
   *
   * @returns A fresh metrics object; {@link EMPTY} values when no samples.
   */
  read(): StabilityMetrics;
  /** Discards every retained sample (e.g. when the marker is lost). */
  reset(): void;
}

/**
 * Creates a stability tracker over a rolling time window.
 *
 * @param windowMs — Length of the rolling window in milliseconds. Samples
 *   older than this (relative to the newest sample) are discarded.
 * @returns A tracker; see {@link StabilityTracker}.
 */
export function createStabilityTracker(windowMs: number = DEFAULT_WINDOW_MS): StabilityTracker {
  let samples: StabilitySample[] = [];

  return {
    add(sample: StabilitySample): void {
      samples.push(sample);
      const cutoff = sample.t - windowMs;
      // Samples arrive in time order, so the stale ones are always a prefix.
      let firstKept = 0;
      while (firstKept < samples.length && samples[firstKept].t < cutoff) firstKept++;
      if (firstKept > 0) samples = samples.slice(firstKept);
    },

    read(): StabilityMetrics {
      const n = samples.length;
      if (n === 0) return { ...EMPTY };
      if (n === 1) return { ...EMPTY, samples: 1 };

      // ── update rate ──────────────────────────────────────────────────────
      const span = samples[n - 1].t - samples[0].t;
      // n samples bound n-1 intervals; dividing by n would under-report.
      const updateHz = span > 0 ? ((n - 1) / span) * 1000 : 0;

      // ── positional jitter: RMS distance from the window's mean position ──
      let mx = 0;
      let my = 0;
      let mz = 0;
      for (const s of samples) {
        mx += s.position.x;
        my += s.position.y;
        mz += s.position.z;
      }
      mx /= n;
      my /= n;
      mz /= n;

      let sumSq = 0;
      let peakSq = 0;
      for (const s of samples) {
        const dx = s.position.x - mx;
        const dy = s.position.y - my;
        const dz = s.position.z - mz;
        const d2 = dx * dx + dy * dy + dz * dz;
        sumSq += d2;
        if (d2 > peakSq) peakSq = d2;
      }
      const positionJitterMm = Math.sqrt(sumSq / n) * 1000;
      const positionPeakMm = Math.sqrt(peakSq) * 1000;

      // ── rotational jitter: RMS angle from the window's mean orientation ──
      // The mean of a set of quaternions is approximated by summing and
      // normalizing. That is only valid when they all point into the same
      // hemisphere — q and -q are the SAME rotation, so a sign flip between
      // samples would otherwise cancel them out and yield a garbage mean.
      // Aligning each sample's sign against the first one avoids that.
      const ref = samples[0].rotation;
      let qx = 0;
      let qy = 0;
      let qz = 0;
      let qw = 0;
      for (const s of samples) {
        const r = s.rotation;
        const sign = r.x * ref.x + r.y * ref.y + r.z * ref.z + r.w * ref.w < 0 ? -1 : 1;
        qx += r.x * sign;
        qy += r.y * sign;
        qz += r.z * sign;
        qw += r.w * sign;
      }
      const qLen = Math.hypot(qx, qy, qz, qw);
      let rotationJitterDeg = 0;
      if (qLen > 1e-9) {
        qx /= qLen;
        qy /= qLen;
        qz /= qLen;
        qw /= qLen;
        let angleSumSq = 0;
        for (const s of samples) {
          const r = s.rotation;
          // |dot| folds the double cover away, so the angle is the shortest
          // rotation between the two orientations rather than up to 2x it.
          const dot = Math.min(1, Math.abs(r.x * qx + r.y * qy + r.z * qz + r.w * qw));
          const angle = 2 * Math.acos(dot);
          angleSumSq += angle * angle;
        }
        rotationJitterDeg = Math.sqrt(angleSumSq / n) * (180 / Math.PI);
      }

      return { samples: n, updateHz, positionJitterMm, rotationJitterDeg, positionPeakMm };
    },

    reset(): void {
      samples = [];
    },
  };
}
