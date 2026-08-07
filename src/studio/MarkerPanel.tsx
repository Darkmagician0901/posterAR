/**
 * MarkerPanel — the story's printed poster, edited in the inspector.
 *
 * Story-level rather than per-frame: a visitor scans one poster and plays every
 * frame from it. The printed width is the field that matters most — it is what
 * turns every authored offset from a stylistic choice into a physical
 * measurement — so it is stated in metres and echoed as a derived height.
 *
 * The image is authoring reference and physical dimensions only. Turning it
 * into a tracked 8th Wall target needs a fingerprint the interactive-only
 * image-target CLI cannot produce headlessly, and is a separate piece of work.
 *
 * Editing rules live in story/marker.ts (applyMarkerEdit) so this component
 * stays a thin surface over pure, tested logic.
 */

import React, { useRef, useState } from 'react';
import {
  applyMarkerEdit,
  DEFAULT_MARKER,
  MARKER_LIMITS,
  markerHeightM,
  type StoryMarker,
} from '@/story/marker';
import { validateAndProcessImage } from '@/utils/imageUpload';
import { useStudioDraft } from './studioDraftStore';

export const MarkerPanel: React.FC = () => {
  const doc = useStudioDraft((s) => s.doc);
  const { patchDoc } = useStudioDraft.getState();

  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const marker: StoryMarker = doc.marker ?? DEFAULT_MARKER;

  const edit = (patch: Partial<StoryMarker>): void =>
    patchDoc({ marker: applyMarkerEdit(marker, patch) });

  const onUpload = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const processed = await validateAndProcessImage(file);
      // The printed aspect comes from the image, so an author only ever has to
      // measure one dimension of the real poster.
      edit({ image: processed.dataUrl, aspect: processed.height / processed.width });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="st-sec">
      <h3>
        POSTER <em>the whole story anchors to it</em>
      </h3>

      <div className="st-marker-row">
        <div className="st-marker-thumb">
          {marker.image === '' ? (
            <span className="st-marker-empty">no image</span>
          ) : (
            <img src={marker.image} alt="The story's printed poster" />
          )}
        </div>
        <div className="st-marker-facts">
          {/* One interpolated string per line: adjacent text nodes would be
              split by a comment marker in the server render. */}
          <div>{`${marker.widthM.toFixed(2)} m wide`}</div>
          <div>{`${markerHeightM(marker).toFixed(2)} m tall`}</div>
          <button
            className="st-btn paper"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'WORKING…' : marker.image === '' ? '⬆ POSTER IMAGE' : '⬆ REPLACE IMAGE'}
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => void onUpload(e.target.files?.[0])}
      />

      {error !== null && <div className="st-warn">{error}</div>}

      <label className="st-lbl" htmlFor="st-marker-w">
        Printed width — measure the real poster
      </label>
      <input
        id="st-marker-w"
        className="st-in"
        type="number"
        min={MARKER_LIMITS.widthMin}
        max={MARKER_LIMITS.widthMax}
        step={0.01}
        value={marker.widthM}
        onChange={(e) => edit({ widthM: Number(e.target.value) })}
      />

      <label className="st-lbl" htmlFor="st-marker-h">
        Hangs at — floor to the middle of the poster
      </label>
      <input
        id="st-marker-h"
        className="st-in"
        type="number"
        min={MARKER_LIMITS.mountMin}
        max={MARKER_LIMITS.mountMax}
        step={0.05}
        value={marker.mountHeight}
        onChange={(e) => edit({ mountHeight: Number(e.target.value) })}
      />

      <div className="st-hintline">
        Props are placed out from this poster: 0 m is flat against the wall.
      </div>
    </div>
  );
};
