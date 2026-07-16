/**
 * gifPlayhead.ts — pure frame-timing state machine for animated GIFs.
 *
 * No canvas, no three.js: given the per-frame delays it tracks which frame
 * should be visible as wall-clock time accumulates. Kept separate from the
 * rendering (gifAnimator.ts) so the timing logic is unit-testable.
 */

// Some GIFs declare a 0 ms (or near-0) delay per frame. Browsers treat such
// delays as 100 ms rather than playing the GIF impossibly fast; we copy that
// behaviour: anything under MIN_DELAY_MS becomes DEFAULT_DELAY_MS.
const MIN_DELAY_MS = 20;
const DEFAULT_DELAY_MS = 100;

/**
 * The playhead for one GIF: tracks which frame should currently be visible.
 *
 * It accumulates elapsed wall-clock time and consumes it against each
 * frame's delay, looping back to frame 0 at the end — like a tape head
 * moving over frames of known duration.
 */
export class GifPlayhead {
  private readonly delays: number[];
  /** Index of the currently visible frame. */
  private index = 0;
  /** Time accumulated toward the current frame's delay, in ms. */
  private acc = 0;

  /**
   * @param rawDelaysMs — Per-frame delays in milliseconds, in playback order.
   *   Delays under MIN_DELAY_MS are normalized to DEFAULT_DELAY_MS (browser
   *   behaviour for broken/zero GIF timings).
   */
  constructor(rawDelaysMs: number[]) {
    this.delays = rawDelaysMs.map((d) => (d < MIN_DELAY_MS ? DEFAULT_DELAY_MS : d));
  }

  /** Index of the frame that should currently be visible. */
  get frameIndex(): number {
    return this.index;
  }

  /** Total number of frames in the sequence. */
  get frameCount(): number {
    return this.delays.length;
  }

  /**
   * Advances the playhead. Loops back to frame 0 at the end of the sequence.
   * No-op for 0- or 1-frame sequences.
   *
   * @param deltaMs — Milliseconds elapsed since the previous call.
   * @returns True if the visible frame changed (the caller should redraw).
   */
  advance(deltaMs: number): boolean {
    if (this.delays.length <= 1) return false;
    this.acc += deltaMs;
    let changed = false;
    // Consume accumulated time one frame-delay at a time. A large delta
    // (e.g. after a slow frame) can step over several frames in one call.
    while (this.acc >= this.delays[this.index]) {
      this.acc -= this.delays[this.index];
      this.index = (this.index + 1) % this.delays.length;
      changed = true;
    }
    return changed;
  }

  /** Rewinds to frame 0 and discards any accumulated time. */
  reset(): void {
    this.index = 0;
    this.acc = 0;
  }
}
