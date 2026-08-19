/**
 * markerApi.ts — storing a marker's two images.
 *
 * Both PNGs go up as ordinary content-addressed objects under the `markers/`
 * prefix, each under the hash of its OWN bytes. There is deliberately no third
 * upload: the tracker's target document is synthesized on the client at load
 * time (`src/markers/markerTarget.ts`), so there is no stored JSON for anyone
 * to poison — see `docs/marker-layer-design.md` §3.4 and §3.5.
 */

import type { MarkerImages } from '@/markers/markerImages';
import { uploadContent } from './contentUpload';

/** The two content addresses one marker is made of. */
export interface UploadedMarker {
  /** SHA-256 of the luminance PNG. This is the marker's identity. */
  markerId: string;
  /** SHA-256 of the thumbnail PNG, addressed on its own bytes. */
  thumbId: string;
}

/**
 * Uploads a marker's luminance and thumbnail images.
 *
 * Sequential rather than parallel: the luminance image is the marker's
 * identity, so if the connection is failing there is no point spending the
 * operator's bandwidth on a thumbnail for a marker that will not exist.
 *
 * @param images — The two PNGs from `renderMarkerImages`.
 * @returns Both content addresses.
 * @throws When either upload fails. A marker without its thumbnail is
 *   unidentifiable in the library and gives the visitor no scan hint, so —
 *   unlike a story asset's optional derivative — this failure is not swallowed.
 */
export async function uploadMarker(images: MarkerImages): Promise<UploadedMarker> {
  const markerId = await uploadContent(images.luminance, 'image/png', 'marker');
  const thumbId = await uploadContent(images.thumbnail, 'image/png', 'marker');
  return { markerId, thumbId };
}
