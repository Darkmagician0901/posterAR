/**
 * MarkersPanel — upload the printed picture a story will be pinned to.
 *
 * A marker starts life as an ordinary photo. The operator crops it to the
 * CLI's 3:4 shape, checks the grayscale rendering — the only place they see
 * what the tracker actually matches against, not what a person sees — and
 * uploads both derived PNGs through the same content-addressed path as every
 * other asset. Each row's "Bind to this story" button is the same one Task 8
 * wires up; it exists here already but has nothing to call yet, so it stays
 * disabled until that task lands.
 *
 * Nothing here is unit-tested: it is canvas rasterization and pointer
 * dragging, and happy-dom has no rasterizer to assert against. Every rule
 * this panel enforces — the crop maths, the library shape — is already
 * covered where it actually lives: markerCrop.test.ts and
 * markerCropEdit.test.ts (Task 4), markerLibrary.test.ts (Task 5),
 * bindMarker/unbindMarker in studioDraftStore.test.ts (Task 8). This file
 * is verified on device instead, per TESTING.md.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  getDefaultCrop,
  MARKER_MIN_HEIGHT,
  MARKER_MIN_WIDTH,
  type ImageSize,
  type MarkerCrop,
} from '@/markers/markerCrop';
import { renderMarkerImages } from '@/markers/markerImages';
import { canCrop, moveCrop, scaleCrop } from './markerCropEdit';
import {
  addToLibrary,
  readMarkerLibrary,
  writeMarkerLibrary,
  type MarkerLibraryEntry,
} from './markerLibrary';
import { uploadMarker } from '@/services/markerApi';
import { markerTargetData } from '@/markers/markerTarget';
import { IDENTITY_LOCAL } from '@/story/storyDoc';
import { toViewBox } from './stageGeometry';
import { useStudioDraft } from './studioDraftStore';

/** Debounce for the grayscale preview while the operator is still dragging. */
const PREVIEW_DEBOUNCE_MS = 150;

/**
 * Origin serving `markers/` PNGs, for library thumbnails.
 *
 * `assetResolver.ts` owns this same read for published assets but does not
 * expose it, so it is repeated here rather than reaching into that module's
 * internals — the identical tradeoff `StageEditor.tsx` already makes for its
 * own ghost-backdrop preview. Empty means same-origin.
 */
const ASSET_BASE_URL: string = import.meta.env.VITE_ASSET_BASE_URL || '';

/**
 * The just-uploaded original for each marker still decoded in memory this
 * page load.
 *
 * `renderMarkerImages` only keeps a resized luminance and thumbnail — the
 * full-resolution cropped colour image a print shop would want is never
 * among them and is never stored (`docs/marker-layer-plan.md` Self-review:
 * "the cropped colour image at full resolution is not among the two PNGs
 * renderMarkerImages returns and is not stored"). The only way to offer that
 * download is to regenerate it from the operator's original file, which
 * means it can only exist while that file is still decoded in memory.
 *
 * Deliberately module-level rather than component state: this panel mounts
 * and unmounts every time the operator opens and closes it (same pattern as
 * StageEditor), and the download should survive that — it should only be
 * lost on an actual page reload, which is also when this module is
 * re-evaluated and the map starts empty again. That boundary is stated in
 * the library list below, not left for the operator to discover.
 */
const sessionOriginals = new Map<string, { bitmap: ImageBitmap; crop: MarkerCrop }>();

/**
 * How many originals to hold at once.
 *
 * These are full-resolution decoded photos, not the resized outputs — a 12
 * megapixel original is roughly 48 MB of RGBA, so an uncapped map would retain
 * half a gigabyte across a ten-marker room and quietly become the heaviest
 * thing in the tab. Four covers re-downloading a marker made a moment ago,
 * which is the case this exists for; past that, evicting is safe precisely
 * because the download was never promised to survive — the UI already tells
 * the operator it lasts only while the photo is in the page, and an evicted
 * row disables itself through the same `has()` check as a reloaded one.
 */
const MAX_REMEMBERED_ORIGINALS = 4;

/**
 * Takes ownership of an original so its print-ready file can be regenerated.
 *
 * @param markerId — The uploaded marker's id.
 * @param bitmap — The operator's decoded photo. Owned by this map afterwards;
 *   callers must not close it.
 * @param crop — The crop it was cut with.
 */
function rememberOriginal(markerId: string, bitmap: ImageBitmap, crop: MarkerCrop): void {
  // Re-uploading the same crop of the same photo yields the same markerId, so
  // replace rather than keep two entries pointing at identical pixels.
  sessionOriginals.get(markerId)?.bitmap.close();
  sessionOriginals.set(markerId, { bitmap, crop });

  // Map iterates in insertion order, so the first key is the oldest.
  while (sessionOriginals.size > MAX_REMEMBERED_ORIGINALS) {
    const oldest = sessionOriginals.keys().next();
    if (oldest.done === true) break;
    sessionOriginals.get(oldest.value)?.bitmap.close();
    sessionOriginals.delete(oldest.value);
  }
}

/**
 * Regenerates the full-resolution cropped colour PNG for printing.
 *
 * Mirrors the rotate-then-crop step inside `markerImages.ts`'s
 * `renderMarkerImages` exactly — same quarter-turn matrix, same argument
 * order — so the print file lines up with what the tracker was trained on,
 * but skips the resize: a print-ready file is supposed to be full
 * resolution. That private helper isn't exported (Task 1's scope), and this
 * task's file list doesn't touch markerImages.ts, so the few lines are
 * duplicated here rather than reached into.
 *
 * @param bitmap — The operator's original decoded photo, before rotation.
 * @param crop — The crop it was cut with, in post-rotation coordinates.
 */
async function renderPrintReadyPng(bitmap: ImageBitmap, crop: MarkerCrop): Promise<Blob> {
  let source: CanvasImageSource = bitmap;

  if (crop.isRotated) {
    const rotated = document.createElement('canvas');
    rotated.width = bitmap.height;
    rotated.height = bitmap.width;
    const rctx = rotated.getContext('2d');
    if (!rctx) throw new Error('marker: could not acquire a 2D canvas context');
    rctx.translate(bitmap.height, 0);
    rctx.rotate(Math.PI / 2);
    rctx.drawImage(bitmap, 0, 0);
    source = rotated;
  }

  const out = document.createElement('canvas');
  out.width = crop.width;
  out.height = crop.height;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('marker: could not acquire a 2D canvas context');
  octx.drawImage(source, crop.left, crop.top, crop.width, crop.height, 0, 0, crop.width, crop.height);

  return new Promise<Blob>((resolve, reject) => {
    out.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('marker: PNG encoding failed'))),
      'image/png',
    );
  });
}

/** Triggers a browser download of `blob` as `filename`. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked on the next tick, not immediately: revoking synchronously after
  // click() races the browser's own read of the URL, and some browsers drop the
  // download. Harmless with one file, but the testbed export below issues two
  // in a row, which is where that race actually shows up.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

interface MarkersPanelProps {
  /** Called when the panel should close. */
  onClose: () => void;
}

export const MarkersPanel: React.FC<MarkersPanelProps> = ({ onClose }) => {
  const [library, setLibrary] = useState<MarkerLibraryEntry[]>(() => readMarkerLibrary());
  const [libraryError, setLibraryError] = useState<string | null>(null);

  // The story's current binding, if any — read from the draft rather than
  // mirrored into local state, so an unbind or rebind elsewhere in Studio
  // (undo, a fresh draft) shows up here without this panel doing anything.
  const boundMarkerId = useStudioDraft((s) => s.doc.anchor?.markerId);
  const bindMarker = useStudioDraft((s) => s.bindMarker);
  const unbindMarker = useStudioDraft((s) => s.unbindMarker);

  // The photo currently being cropped, if any. These four are always set
  // together (onFile) and cleared together (resetEditor / after upload).
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [postSize, setPostSize] = useState<ImageSize | null>(null);
  const [crop, setCrop] = useState<MarkerCrop | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const requestId = useRef(0);

  // One revoke-on-change-or-unmount effect per owned object URL. Cleanup (not
  // the effect body) does the revoking, so the SAME code path covers "the
  // operator dragged again and a new URL replaced this one" and "the panel
  // closed" — an un-revoked URL keeps the blob it points at alive for the
  // life of the document.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Closing the edited bitmap is driven by this ref, NOT by an effect keyed on
  // `bitmap`. That was the obvious way to write it and it is wrong: after a
  // successful upload, resetEditor sets bitmap to null, React runs the previous
  // cleanup — which closed over the bitmap upload had just handed to
  // sessionOriginals — and the print-ready download it was kept for would fail
  // every single time. The ref makes ownership explicit instead: whatever is in
  // it is ours to close, and upload clears it without closing to transfer.
  const ownedBitmap = useRef<ImageBitmap | null>(null);

  useEffect(() => {
    return () => {
      ownedBitmap.current?.close();
      ownedBitmap.current = null;
    };
  }, []);

  // Regenerates the grayscale preview after the operator stops dragging.
  // renderMarkerImages does real canvas work, so calling it on every
  // pointermove would visibly stutter. The request id guards against a slow
  // render for an old crop overwriting the preview of a newer one.
  useEffect(() => {
    if (!bitmap || !crop) return;
    const id = ++requestId.current;
    const timer = window.setTimeout(() => {
      renderMarkerImages(bitmap, crop).then(
        (images) => {
          if (requestId.current !== id) return; // superseded by a later drag
          setPreviewUrl(URL.createObjectURL(images.luminance));
        },
        () => {
          if (requestId.current !== id) return;
          setDecodeError('Could not render a preview for this crop.');
        },
      );
    }, PREVIEW_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [bitmap, crop]);

  const resetEditor = (): void => {
    setBitmap(null);
    setPostSize(null);
    setCrop(null);
    setPhotoUrl(null);
    setDecodeError(null);
    setName('');
    setPreviewUrl(null);
  };

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    resetEditor();
    setUploadError(null);

    let decoded: ImageBitmap;
    try {
      decoded = await createImageBitmap(file);
    } catch {
      setDecodeError('Could not read that image.');
      return;
    }

    // Every later call takes the ROTATED size, never the bitmap's own — a
    // landscape photo is presented, cropped, and validated as the portrait
    // it will be printed as. Getting this backwards is the single most
    // likely bug in this file (see the plan).
    const isRotated = decoded.width > decoded.height;
    const rotatedSize: ImageSize = isRotated
      ? { width: decoded.height, height: decoded.width }
      : { width: decoded.width, height: decoded.height };

    if (!canCrop(rotatedSize)) {
      setDecodeError(
        `This photo is ${rotatedSize.width}×${rotatedSize.height}px after rotation — ` +
          `markers need at least ${MARKER_MIN_WIDTH}×${MARKER_MIN_HEIGHT}.`,
      );
      decoded.close();
      return;
    }

    // The previous photo is being replaced and nothing else refers to it.
    ownedBitmap.current?.close();
    ownedBitmap.current = decoded;

    setBitmap(decoded);
    setPostSize(rotatedSize);
    // getDefaultCrop takes the PRE-rotation size and does the swap itself.
    setCrop(getDefaultCrop({ width: decoded.width, height: decoded.height }, isRotated));
    setPhotoUrl(URL.createObjectURL(file));
    setName(file.name.replace(/\.[^.]+$/, ''));
    if (fileRef.current) fileRef.current.value = '';
  };

  const onCropPointerDown = (e: React.PointerEvent<SVGRectElement>): void => {
    if (!svgRef.current || !postSize) return;
    e.preventDefault();
    dragStart.current = toViewBox(
      e.clientX,
      e.clientY,
      svgRef.current.getBoundingClientRect(),
      postSize.width,
      postSize.height,
    );
  };

  const onCropPointerMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (!dragStart.current || !svgRef.current || !postSize) return;
    const pt = toViewBox(
      e.clientX,
      e.clientY,
      svgRef.current.getBoundingClientRect(),
      postSize.width,
      postSize.height,
    );
    const dx = pt.x - dragStart.current.x;
    const dy = pt.y - dragStart.current.y;
    dragStart.current = pt;
    setCrop((c) => (c ? moveCrop(c, dx, dy, postSize) : c));
  };

  const endCropDrag = (): void => {
    dragStart.current = null;
  };

  const zoom = (factor: number): void => {
    if (!postSize) return;
    setCrop((c) => (c ? scaleCrop(c, factor, postSize) : c));
  };

  const upload = async (): Promise<void> => {
    if (!bitmap || !crop) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      // Rendered fresh rather than reusing the debounced preview's blobs:
      // the operator can click Upload before the 150ms debounce has caught
      // up with the last drag, and the preview only ever keeps the painted
      // luminance URL around, not the source blobs.
      const images = await renderMarkerImages(bitmap, crop);
      const uploaded = await uploadMarker(images);
      const entry: MarkerLibraryEntry = {
        markerId: uploaded.markerId,
        thumbId: uploaded.thumbId,
        name: name.trim() || 'Untitled marker',
        crop,
        addedAt: Date.now(),
      };
      const next = addToLibrary(library, entry);
      setLibraryError(writeMarkerLibrary(next));
      setLibrary(next);

      // Ownership of the bitmap moves to sessionOriginals here, so the ref is
      // cleared WITHOUT closing: the print-ready download still needs it, and
      // the map is now responsible for closing it on eviction.
      rememberOriginal(entry.markerId, bitmap, crop);
      ownedBitmap.current = null;
      resetEditor();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Check your connection.');
    } finally {
      setUploadBusy(false);
    }
  };

  const downloadPrintReady = async (entry: MarkerLibraryEntry): Promise<void> => {
    const original = sessionOriginals.get(entry.markerId);
    if (!original) return;
    setDownloadingId(entry.markerId);
    try {
      const blob = await renderPrintReadyPng(original.bitmap, original.crop);
      downloadBlob(blob, `marker-${entry.markerId.slice(0, 12)}.png`);
    } catch {
      setLibraryError('Could not render the print-ready file.');
    } finally {
      setDownloadingId(null);
    }
  };

  /**
   * Exports the two files the marker testbed loads from disk.
   *
   * Phase 0 compares this browser-made fingerprint against one the CLI made
   * from the same photo, and the testbed (`feat/marker-spaces-testbed`,
   * `?mode=marker`) reads targets out of `public/image-targets/` — so without
   * an export there is no way to get a browser fingerprint into the thing that
   * measures it, and the gating measurement cannot be taken at all.
   *
   * The names are not cosmetic. `markerTargetData` sets `imagePath` to
   * `/image-targets/<markerId>.png`, and the testbed's loader leaves an
   * already-absolute path alone, so the JSON resolves to its sibling PNG only
   * if that PNG keeps the markerId as its filename. Renaming either file
   * breaks the pair.
   *
   * The luminance PNG is re-rendered rather than fetched back from the bucket:
   * the same bytes either way (content addressing guarantees it), but no CORS
   * dependency and no reliance on OPS-M1, which is exactly what Phase 0 has
   * not run yet.
   */
  const downloadTestbedFiles = async (entry: MarkerLibraryEntry): Promise<void> => {
    const original = sessionOriginals.get(entry.markerId);
    if (!original) return;
    setDownloadingId(entry.markerId);
    try {
      const images = await renderMarkerImages(original.bitmap, original.crop);
      const target = markerTargetData({
        type: 'marker',
        markerId: entry.markerId,
        thumbId: entry.thumbId,
        crop: entry.crop,
        local: IDENTITY_LOCAL,
        widthInMarkers: 1,
        mode: 'follow',
      });

      downloadBlob(images.luminance, `${entry.markerId}.png`);
      downloadBlob(
        new Blob([JSON.stringify(target, null, 2)], { type: 'application/json' }),
        `${entry.markerId}.json`,
      );
    } catch {
      setLibraryError('Could not render the testbed files.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="st-modal on" role="dialog" aria-label="Markers">
      <div className="st-modalbox">
        <div className="st-modalhead">
          <h2>MARKERS</h2>
          <span className="st-sub">
            the picture visitors will point their phone at — scanning is not wired into the viewer
            yet, so binding is recorded and published but nothing detects it on device
          </span>
          <button className="st-closex" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {bitmap === null || postSize === null || crop === null ? (
          <>
            <div className="st-mk-drop">
              <button
                className="st-btn green"
                onClick={() => fileRef.current?.click()}
                title="Choose a photo to turn into a marker"
              >
                ⬆ SELECT PHOTO
              </button>
              <span className="st-hintline">
                A printed picture, photographed straight-on. It gets cropped to 3:4 — the shape
                the tracker matches — and a landscape photo is rotated to portrait first.
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            {decodeError !== null && <div className="st-warn">{decodeError}</div>}
          </>
        ) : (
          <div className="st-mk-editor">
            <div className="st-mk-cropcol">
              <div className="st-viewttl">CROP — drag the box to move it</div>
              <div className="st-mk-cropwrap">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${postSize.width} ${postSize.height}`}
                  className="st-stagesvg"
                  onPointerMove={onCropPointerMove}
                  onPointerUp={endCropDrag}
                  onPointerLeave={endCropDrag}
                >
                  {photoUrl && (
                    <image
                      href={photoUrl}
                      x="0"
                      y="0"
                      width={bitmap.width}
                      height={bitmap.height}
                      // Same quarter-turn as renderMarkerImages' rotateAndCrop
                      // step — this preview and the crop drawn over it must
                      // stay in the one coordinate space Task 4's maths uses,
                      // per the plan's "do not invent a second mapping" note.
                      transform={
                        crop.isRotated ? `translate(${bitmap.height},0) rotate(90)` : undefined
                      }
                    />
                  )}
                  {/* Dims everything outside the crop, as four bands rather
                      than one rect with a blend mode — simpler to reason
                      about and consistent across browsers. */}
                  <rect x={0} y={0} width={postSize.width} height={crop.top} className="st-mk-dim" />
                  <rect
                    x={0}
                    y={crop.top + crop.height}
                    width={postSize.width}
                    height={Math.max(0, postSize.height - crop.top - crop.height)}
                    className="st-mk-dim"
                  />
                  <rect x={0} y={crop.top} width={crop.left} height={crop.height} className="st-mk-dim" />
                  <rect
                    x={crop.left + crop.width}
                    y={crop.top}
                    width={Math.max(0, postSize.width - crop.left - crop.width)}
                    height={crop.height}
                    className="st-mk-dim"
                  />
                  <rect
                    className="st-mk-cropbox"
                    x={crop.left}
                    y={crop.top}
                    width={crop.width}
                    height={crop.height}
                    onPointerDown={onCropPointerDown}
                  />
                </svg>
              </div>
              <div className="st-mk-zoomrow">
                <button className="st-ppb" onClick={() => zoom(0.9)} title="Shrink the crop box">
                  − ZOOM OUT
                </button>
                <button className="st-ppb" onClick={() => zoom(1.1)} title="Grow the crop box">
                  + ZOOM IN
                </button>
                <button className="st-ppb" onClick={resetEditor} title="Choose a different photo">
                  ✕ CHOOSE ANOTHER
                </button>
              </div>
            </div>

            <div className="st-mk-previewcol">
              <div className="st-viewttl">GRAYSCALE — what the tracker sees</div>
              <div className="st-mk-graybox">
                {previewUrl ? (
                  <img src={previewUrl} alt="Grayscale marker preview" />
                ) : (
                  <span className="st-pp-empty">rendering…</span>
                )}
              </div>
              <div className="st-hintline">
                Good markers are <b>detailed, busy, and non-repeating</b>, and <b>matte</b> when
                printed so glare doesn't wash out the detail. This grayscale image is the only
                moment you see what the tracker actually matches against — a photo can look rich
                in colour and still read flat once the colour is gone.
              </div>

              <label className="st-lbl" htmlFor="st-mk-name">
                Label (for your own library only — never reaches visitors)
              </label>
              <input
                id="st-mk-name"
                className="st-in"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />

              {uploadError !== null && <div className="st-warn st-mt">{uploadError}</div>}

              <div className="st-modalfoot">
                <button className="st-btn paper" onClick={resetEditor} disabled={uploadBusy}>
                  CANCEL
                </button>
                <button className="st-btn green" onClick={() => void upload()} disabled={uploadBusy}>
                  {uploadBusy ? 'UPLOADING…' : '⬆ UPLOAD MARKER'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="st-mk-library">
          <div className="st-viewttl">YOUR MARKERS</div>
          {libraryError !== null && <div className="st-warn">{libraryError}</div>}
          {library.length === 0 ? (
            <span className="st-pp-empty">Nothing uploaded on this device yet.</span>
          ) : (
            <>
              <ul className="st-mk-list">
                {[...library].reverse().map((entry) => {
                  const canDownload = sessionOriginals.has(entry.markerId);
                  const isBound = entry.markerId === boundMarkerId;
                  return (
                    <li key={entry.markerId} className="st-mk-row">
                      <img
                        className="st-mk-thumb"
                        src={`${ASSET_BASE_URL}/markers/${entry.thumbId}.png`}
                        alt=""
                      />
                      <div className="st-mk-info">
                        <span className="st-mk-name">{entry.name}</span>
                        <span className="st-mk-dims">
                          {entry.crop.width}×{entry.crop.height}px
                        </span>
                        {isBound && <span className="st-pp-empty">Bound to this story</span>}
                      </div>
                      <div className="st-mk-rowbtns">
                        {isBound ? (
                          <button
                            className="st-ppb"
                            onClick={unbindMarker}
                            title="Detach this story from this picture, restoring tap-to-place"
                          >
                            UNBIND
                          </button>
                        ) : (
                          <button
                            className="st-ppb"
                            onClick={() => bindMarker(entry)}
                            title="Attach this story to this picture, replacing any current binding"
                          >
                            BIND TO STORY
                          </button>
                        )}
                        <button
                          className="st-ppb"
                          disabled={!canDownload || downloadingId === entry.markerId}
                          onClick={() => void downloadPrintReady(entry)}
                          title={
                            canDownload
                              ? 'Download the full-resolution cropped image for printing'
                              : 'Only available while the original photo is still open in this tab — re-drop it to regenerate this file'
                          }
                        >
                          {downloadingId === entry.markerId ? 'RENDERING…' : '⬇ PRINT-READY PNG'}
                        </button>
                        <button
                          className="st-ppb"
                          disabled={!canDownload || downloadingId === entry.markerId}
                          onClick={() => void downloadTestbedFiles(entry)}
                          title={
                            canDownload
                              ? 'Download the grayscale image and target JSON the marker testbed loads — keep both filenames as they are'
                              : 'Only available while the original photo is still open in this tab — re-drop it to regenerate these files'
                          }
                        >
                          ⬇ TESTBED FILES
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="st-hintline">
                Both downloads are regenerated from the original photo in this browser tab — they
                are not stored anywhere, so they disappear on reload. Re-drop a photo to get a
                fresh one.
              </div>
              <div className="st-hintline">
                <b>Testbed files</b> are for the on-device tracking check: copy both into{' '}
                <code>public/image-targets/</code> on the marker testbed branch and add the{' '}
                <code>.json</code> filename to <code>manifest.json</code>. Keep the filenames as
                downloaded — the JSON finds its image by name.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MarkersPanel;
