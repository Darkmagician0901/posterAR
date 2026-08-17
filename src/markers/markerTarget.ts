/**
 * markerTarget.ts — the tracker's target document, built rather than fetched.
 *
 * `@8thwall/image-target-cli` writes this JSON to disk; nothing here does.
 * Everything in it is a constant, derivable from the markerId, or carried by
 * the anchor, so storing it would add an object nobody can verify — and on an
 * unauthenticated, first-writer-wins endpoint, an unverifiable object is a
 * squattable one. A poisoned target would be the worst of the three files,
 * because an attacker-chosen absolute `imagePath` reaches the engine untouched.
 * See `docs/marker-layer-design.md` §3.4 and §3.5.
 */

import type { MarkerCrop } from './markerCrop';
import type { StoryAnchor } from '@/story/storyDoc';

/**
 * Same-origin route the marker luminance images are served from.
 *
 * The engine resolves `imagePath` relative to the PAGE url, and its handling
 * of an absolute cross-origin path is undocumented. The app is served from
 * Amplify and content from the S3/CloudFront origin, so this must be a rewrite
 * on the app's own domain, ordered before the SPA catch-all — see
 * `docs/marker-layer-design.md` §9 and open item OPS-M1.
 */
export const MARKER_IMAGE_ROUTE = '/image-targets';

/** The fingerprint document the engine's `imageTargetData` takes. */
export interface ImageTargetData {
  imagePath: string;
  /** Always null. The CLI emits the literal value; nothing reads it. */
  metadata: null;
  /** The markerId — see `markerTargetData`. */
  name: string;
  type: 'PLANAR';
  properties: MarkerCrop;
  resources: { luminanceImage: string };
  created: number;
  updated: number;
}

/**
 * Builds the target document for one anchor.
 *
 * `name` is the markerId rather than the operator's label, for two reasons:
 * `imagefound` events carry `name`, so a detection keys directly into the
 * marker→story map with no second lookup; and two markers cannot collide on a
 * human-chosen label. The operator's own name is Studio-side metadata that
 * never reaches the engine.
 *
 * @param anchor — A validated anchor. Its `markerId` has already matched
 *   ASSET_ID_RE, so the path built here cannot express a scheme or a
 *   traversal — which is what makes an untrusted published document safe to
 *   turn into a URL.
 * @returns The fingerprint document, identical on every call.
 */
export function markerTargetData(anchor: StoryAnchor): ImageTargetData {
  return {
    imagePath: `${MARKER_IMAGE_ROUTE}/${anchor.markerId}.png`,
    metadata: null,
    name: anchor.markerId,
    type: 'PLANAR',
    properties: anchor.crop,
    resources: { luminanceImage: `${anchor.markerId}.png` },
    // Zeroed, not `Date.now()`: nothing reads them, and a wall-clock value
    // would make the derived document differ between loads for no reason.
    created: 0,
    updated: 0,
  };
}
