/**
 * gifPlayhead.ts — pure frame-timing state machine for animated GIFs.
 *
 * No canvas, no three.js: given the per-frame delays it tracks which frame
 * should be visible as wall-clock time accumulates. Kept separate from the
 * rendering (gifAnimator.ts) so the timing logic is unit-testable.
 */

/** Delays below this (e.g. 0) are treated as DEFAULT_DELAY_MS, matching browsers. */
const MIN_DELAY_MS = 20
const DEFAULT_DELAY_MS = 100

export class GifPlayhead {
  private readonly delays: number[]
  private index = 0
  private acc = 0

  constructor(rawDelaysMs: number[]) {
    this.delays = rawDelaysMs.map((d) => (d < MIN_DELAY_MS ? DEFAULT_DELAY_MS : d))
  }

  get frameIndex(): number {
    return this.index
  }

  get frameCount(): number {
    return this.delays.length
  }

  /**
   * Advance the playhead by `deltaMs`. Returns true if the visible frame
   * changed. Loops at the end. No-op for 0/1-frame sequences.
   */
  advance(deltaMs: number): boolean {
    if (this.delays.length <= 1) return false
    this.acc += deltaMs
    let changed = false
    while (this.acc >= this.delays[this.index]) {
      this.acc -= this.delays[this.index]
      this.index = (this.index + 1) % this.delays.length
      changed = true
    }
    return changed
  }

  reset(): void {
    this.index = 0
    this.acc = 0
  }
}
