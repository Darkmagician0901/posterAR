/**
 * canvasScreenshot — typed wrapper around 8th Wall's CanvasScreenshot module.
 *
 * The XR8 engine renders the camera feed + three.js scene into a canvas with
 * no preserveDrawingBuffer, so reading it with toDataURL() outside the render
 * loop yields a blank frame (see @/utils/screenshot header). The engine's own
 * CanvasScreenshot module captures the composited frame from inside its render
 * loop instead. Its pipeline module is registered in pipeline.ts; this file
 * wraps the untyped `XR8.CanvasScreenshot.takeScreenshot()` global (a Promise
 * of a base64 JPEG payload WITHOUT the `data:` prefix) behind a typed,
 * graceful-failure API.
 *
 * Exports: isXr8ScreenshotAvailable, takeXr8Photo.
 */

import {
  screenshotResultFromBase64Jpeg,
  ScreenshotResult,
} from '@/utils/screenshot'

/**
 * True when the running engine binary exposes the CanvasScreenshot module
 * (its pipeline module registration in pipeline.ts is likewise guarded).
 */
export function isXr8ScreenshotAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.XR8?.CanvasScreenshot?.takeScreenshot === 'function'
  )
}

/**
 * Capture the composited camera + AR scene via the engine. Rejects with a
 * readable Error when the module is unavailable or the engine capture fails.
 */
export async function takeXr8Photo(): Promise<ScreenshotResult> {
  if (!isXr8ScreenshotAvailable()) {
    throw new Error('8th Wall screenshot module unavailable')
  }
  const base64: string = await window.XR8.CanvasScreenshot.takeScreenshot()
  return screenshotResultFromBase64Jpeg(base64)
}
