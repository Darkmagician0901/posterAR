/**
 * StageEditor — the modal where a frame's art is staged.
 *
 * Two views of the same scene. The camera view shows exactly what the composer
 * will emit (it *is* the composed SVG), with invisible handles over each prop
 * for dragging left and right. The top-down map is the only place depth can be
 * set, because a vertical drag in the camera view is ambiguous between "further
 * away" and "lifted off the ground".
 *
 * Props come from the built-in library or from the author's own uploads. An
 * upload is compressed through the same path as poster uploads, checked for
 * composability (animated GIFs are refused — see assetGuard.ts), and then
 * uploaded to asset storage immediately; the document records only the
 * resulting content address, never the bytes.
 *
 * Saving composes the props into the frame's `art`. Both are kept: `props` so
 * the frame stays re-editable, `art` because that is all the viewer reads.
 */

import React, { useMemo, useRef, useState } from 'react';
import { StoryProp, type StoryAssetRef } from '@/story/storyDoc';
import { PROP_LIBRARY } from '@/story/props/library';
import { composeFrame, COMPOSE_DEFAULTS } from '@/story/props/compose';
import { validateAndProcessImage, downscaleToWebp, formatBytes } from '@/utils/imageUpload';
import { RASTER_LONGEST_AXIS } from '@/story/assetStorage';
import { useStudioDraft } from './studioDraftStore';
import { svgToDataUrl } from './svgPreview';
import { deriveBackdrop, parseSvgDoc, scaledBackdrop } from './backdrop';
import { PROP_LIMITS, duplicateProp } from './propEdit';
import { checkComposable } from './assetGuard';
import { uploadStoryAsset, type AssetContentType, type UploadedAsset } from '@/services/assetApi';
import { toComposeImages, assertPersistable } from './composeImages';
import { useResolvedAssets } from './useResolvedAssets';
import {
  FRONT,
  TOP,
  frontProject,
  frontUnprojectX,
  topProject,
  topUnproject,
  toViewBox,
} from './stageGeometry';

/** Where a newly added prop lands. */
const DROP_IN = { x: 0, z: 1.5 };

/**
 * Best-effort display derivative for an already-compressed upload blob.
 *
 * Re-decodes the blob (createImageBitmap is the same decode route
 * `imageUpload.ts` uses) and shrinks it to the rasterizer's budget via
 * `downscaleToWebp`. Exported (rather than inlined in `onUpload`) so the two
 * branches it must get right — an oversized source producing bytes, an
 * undersized one correctly yielding null rather than an error — are pinned
 * directly, without needing to exercise real canvas encoding.
 *
 * Never throws: a decode or encode failure here must not fail the surrounding
 * upload. `null` covers both "already within the cap" (the normal case for a
 * small image) and "could not be produced" — `uploadStoryAsset` treats both
 * identically as "no derivative", and the resolver already falls back to
 * full.webp.
 *
 * @param blob — The processed (already-compressed) upload payload.
 * @returns WebP bytes capped at {@link RASTER_LONGEST_AXIS}, or null.
 */
export async function buildDisplayDerivative(blob: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    try {
      return await downscaleToWebp(bitmap, RASTER_LONGEST_AXIS);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

interface StageEditorProps {
  /** Index of the frame being staged. */
  frameIndex: number;
  /** Called when the modal should close. */
  onClose: () => void;
}

export const StageEditor: React.FC<StageEditorProps> = ({ frameIndex, onClose }) => {
  const doc = useStudioDraft((s) => s.doc);
  const { patchFrame, addAsset } = useStudioDraft.getState();

  const frame = doc.frames[frameIndex];
  const [props, setLocal] = useState<StoryProp[]>(frame?.props ?? []);
  // The frame's existing art, frozen at open as the layer drawn behind the
  // props. Freezing it (rather than re-reading the composed art) is what keeps
  // re-editing from folding already-placed props back into the backdrop.
  const [backdropDoc] = useState(() => (frame ? deriveBackdrop(frame) : ''));
  const [selected, setSelected] = useState(-1);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const frontRef = useRef<SVGSVGElement>(null);
  const topRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<{ index: number; view: 'front' | 'top' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Raw asset map — used for display metadata (name/aspect) and as the shared
  // input to both compose-image maps below. Memoized because `?? {}` would
  // mint a new object each render and defeat those memos.
  const assets = useMemo(() => doc.assets ?? {}, [doc.assets]);

  // The live preview needs real pixels, so v4 (assetId) references are
  // resolved to `data:` URLs here.
  const resolvedAssets = useResolvedAssets(doc.assets);
  const previewImages = useMemo(
    () => toComposeImages(assets, resolvedAssets),
    [assets, resolvedAssets],
  );

  // Art that gets persisted must carry `asset:<alias>` tokens rather than
  // bytes — no resolved map is passed here. See save() below.
  const persistImages = useMemo(() => toComposeImages(assets), [assets]);

  // The backdrop's native size, parsed once. Its inner markup is the layer the
  // preview and the saved art both draw behind the props.
  const backdrop = useMemo(() => parseSvgDoc(backdropDoc), [backdropDoc]);

  // The camera view is the composer's own output, so what is dragged here is
  // exactly what gets saved — no second rendering path to drift out of sync.
  // The backdrop is scaled to fill the taller camera-view frame.
  const previewSvg = useMemo(
    () =>
      composeFrame(props, {
        width: FRONT.w,
        height: FRONT.h,
        groundY: FRONT.groundY,
        ppm: FRONT.ppm,
        images: previewImages,
        backdrop: scaledBackdrop(backdrop.inner, backdrop.width, backdrop.height, FRONT.w, FRONT.h),
      }),
    [props, previewImages, backdrop],
  );

  const update = (index: number, patch: Partial<StoryProp>): void =>
    setLocal((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const addLibraryProp = (key: string): void => {
    setLocal((list) => [
      ...list,
      { t: 'lib', k: key, ...DROP_IN, h: PROP_LIBRARY[key].heightM, f: false, e: 0 },
    ]);
    setSelected(props.length);
  };

  const onUpload = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setUploadError(null);
    setBusy(true);
    try {
      const processed = await validateAndProcessImage(file);

      const check = checkComposable(processed.mimeType);
      if (!check.ok) {
        setUploadError(check.reason);
        return;
      }

      // The processed payload is what gets stored and hashed — not the
      // original file.
      const blob = await (await fetch(processed.dataUrl)).blob();

      // Best-effort display derivative. Deliberately outside the upload
      // try/catch below — buildDisplayDerivative never throws, but even if
      // it did, a derivative problem must never surface as an upload failure.
      const derivative = await buildDisplayDerivative(blob);

      let uploaded: UploadedAsset;
      try {
        // checkComposable above refuses every GIF, so processed.mimeType is
        // always 'image/webp' (see processImage) by the time we get here —
        // the only member of AssetContentType.
        uploaded = await uploadStoryAsset(blob, processed.mimeType as AssetContentType, derivative);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed. Check your connection.');
        return;
      }

      // The document records only content addresses. No bytes ever reach the
      // draft, which is what keeps it inside the localStorage budget. Both ids
      // are recorded: the derivative is a separate asset with its own address,
      // so without r1024Id nothing could ever find it. addAsset resolves any
      // filename collision itself and returns the alias it actually used.
      const ref: StoryAssetRef = {
        assetId: uploaded.assetId,
        aspect: processed.width / processed.height,
        name: processed.originalName,
      };
      if (uploaded.r1024Id !== undefined) ref.r1024Id = uploaded.r1024Id;
      const alias = addAsset(processed.originalName, ref);
      // Size it so the image's real proportions read at a sensible scale.
      setLocal((list) => [...list, { t: 'img', k: alias, ...DROP_IN, h: 1.8, f: false, e: 0 }]);
      setSelected(props.length);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read that image');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const drag = dragging.current;
    if (drag === null) return;
    const prop = props[drag.index];
    if (!prop) return;

    if (drag.view === 'front' && frontRef.current) {
      const pt = toViewBox(
        e.clientX,
        e.clientY,
        frontRef.current.getBoundingClientRect(),
        FRONT.w,
        FRONT.h,
      );
      update(drag.index, { x: Number(frontUnprojectX(pt.x, prop.z).toFixed(2)) });
    } else if (drag.view === 'top' && topRef.current) {
      const pt = toViewBox(
        e.clientX,
        e.clientY,
        topRef.current.getBoundingClientRect(),
        TOP.w,
        TOP.h,
      );
      const { x, z } = topUnproject(pt.x, pt.y);
      update(drag.index, { x: Number(x.toFixed(2)), z: Number(z.toFixed(2)) });
    }
  };

  const endDrag = (): void => {
    dragging.current = null;
  };

  const save = (): void => {
    // Refuse rather than silently re-inline a v3 legacy asset's bytes into
    // `frame.art` — see assertPersistable's doc comment. Surfaced through the
    // same uploadError banner the upload flow already uses.
    try {
      assertPersistable(persistImages);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not save this stage.');
      return;
    }

    // Compose at the backdrop's native size so its inner markup drops in
    // unscaled — the saved art stays byte-faithful to the original scene — with
    // the props' ground line and scale following the same proportion. The
    // backdrop is stored so a later re-edit reads it rather than re-deriving it
    // from this composed art (which already contains the props).
    const groundScale = backdrop.height / COMPOSE_DEFAULTS.height;
    patchFrame(frameIndex, {
      props,
      backdrop: backdropDoc,
      art: composeFrame(props, {
        width: backdrop.width,
        height: backdrop.height,
        groundY: COMPOSE_DEFAULTS.groundY * groundScale,
        ppm: COMPOSE_DEFAULTS.ppm * groundScale,
        images: persistImages,
        backdrop: backdrop.inner,
      }),
    });
    onClose();
  };

  const sel = selected >= 0 ? props[selected] : undefined;
  const selName =
    sel === undefined
      ? ''
      : sel.t === 'lib'
        ? (PROP_LIBRARY[sel.k]?.name ?? sel.k)
        : (assets[sel.k]?.name ?? 'UPLOAD');

  return (
    <div className="st-modal on" role="dialog" aria-label="Stage editor">
      <div className="st-modalbox">
        <div className="st-modalhead">
          <h2>STAGE EDITOR</h2>
          <span className="st-sub">
            drag in either view · the camera view is exactly what gets saved
          </span>
          <button className="st-closex" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="st-views" onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
          <div className="st-viewcol">
            <div className="st-viewttl">CAMERA VIEW — what visitors see</div>
            <div className="st-frontwrap">
              <svg ref={frontRef} viewBox={`0 0 ${FRONT.w} ${FRONT.h}`} className="st-stagesvg">
                <image href={svgToDataUrl(previewSvg)} x="0" y="0" width={FRONT.w} height={FRONT.h} />
                {props.map((p, i) => {
                  const pt = frontProject(p.x, p.z, p.e);
                  const s = 1 / (1 + 0.16 * Math.max(0, p.z));
                  const hpx = p.h * FRONT.ppm * s;
                  const aspect =
                    p.t === 'img'
                      ? (assets[p.k]?.aspect ?? 1)
                      : PROP_LIBRARY[p.k]
                        ? PROP_LIBRARY[p.k].bbox.w / PROP_LIBRARY[p.k].bbox.h
                        : 1;
                  const wpx = hpx * aspect;
                  return (
                    <rect
                      key={i}
                      className={`st-handle ${selected === i ? 'sel' : ''}`}
                      x={pt.x - wpx / 2}
                      y={pt.y - hpx}
                      width={wpx}
                      height={hpx}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setSelected(i);
                        dragging.current = { index: i, view: 'front' };
                      }}
                    />
                  );
                })}
              </svg>
            </div>
            <div className="st-hintline">
              Drag left and right here. Depth is set on the map — a vertical drag would be
              ambiguous between further away and lifted off the ground.
            </div>
          </div>

          <div className="st-viewcol">
            <div className="st-viewttl">TOP-DOWN MAP — sets depth</div>
            <div className="st-topwrap">
              <svg ref={topRef} viewBox={`0 0 ${TOP.w} ${TOP.h}`} className="st-stagesvg">
                <rect x="0" y="0" width={TOP.w} height={TOP.h} fill="#20301a" />
                {[1, 2, 3, 4, 5, 6].map((m) => {
                  const y = topProject(0, m).y;
                  return (
                    <g key={m}>
                      <line x1="0" y1={y} x2={TOP.w} y2={y} stroke="#3a5230" strokeWidth="1" />
                      <text x="6" y={y - 4} fontSize="11" fill="#6a8a58">
                        {m} m
                      </text>
                    </g>
                  );
                })}
                <line
                  x1={TOP.w / 2}
                  y1="0"
                  x2={TOP.w / 2}
                  y2={TOP.h}
                  stroke="#3a5230"
                  strokeWidth="1"
                  strokeDasharray="5 5"
                />
                {/* The visitor stands at the bottom edge, looking up the map. */}
                <polygon
                  points={`${TOP.w / 2 - 9},${TOP.h - 2} ${TOP.w / 2 + 9},${TOP.h - 2} ${TOP.w / 2},${TOP.h - 20}`}
                  fill="#f08a1e"
                  stroke="#120e0e"
                  strokeWidth="2"
                />
                {props.map((p, i) => {
                  const pt = topProject(p.x, p.z);
                  return (
                    <circle
                      key={i}
                      className={`st-dot ${selected === i ? 'sel' : ''}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={selected === i ? 11 : 8}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setSelected(i);
                        dragging.current = { index: i, view: 'top' };
                      }}
                    />
                  );
                })}
              </svg>
            </div>
            <div className="st-hintline">
              The orange marker is the visitor. Drag a dot up to push that prop further away.
            </div>
          </div>
        </div>

        <div className="st-palette">
          {Object.entries(PROP_LIBRARY).map(([key, def]) => (
            <button key={key} className="st-pal" onClick={() => addLibraryProp(key)} title={def.name}>
              <span className="st-palimg">
                <img
                  src={svgToDataUrl(
                    `<svg viewBox="${def.bbox.x} ${def.bbox.y} ${def.bbox.w} ${def.bbox.h}" xmlns="http://www.w3.org/2000/svg">${def.make()}</svg>`,
                  )}
                  alt=""
                />
              </span>
              <span>{def.name}</span>
            </button>
          ))}
          <button
            className="st-pal upload"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title="Upload your own artwork"
          >
            <span className="st-palimg">{busy ? '…' : '⬆'}</span>
            <span>{busy ? 'WORKING' : 'UPLOAD'}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            // GIF omitted: assetGuard refuses every GIF outright (frame art is
            // rasterized to a single still), so listing it here would only
            // invite a selection that is guaranteed to fail.
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => void onUpload(e.target.files?.[0])}
          />
        </div>

        {uploadError !== null && <div className="st-warn">{uploadError}</div>}

        <div className="st-proppanel">
          {sel === undefined ? (
            <span className="st-pp-empty">
              Tap a palette item to add it · tap a placed prop to edit it
            </span>
          ) : (
            <>
              <span className="st-pp-name">{selName}</span>
              <label className="st-pp-field">
                <span>X — left / right</span>
                <span className="st-fr">
                  <input
                    type="range"
                    min={-PROP_LIMITS.xMax}
                    max={PROP_LIMITS.xMax}
                    step={0.05}
                    value={sel.x}
                    onChange={(e) => update(selected, { x: Number(e.target.value) })}
                  />
                  <span className="st-val">
                    {sel.x >= 0 ? '+' : ''}
                    {sel.x.toFixed(2)} m
                  </span>
                </span>
              </label>
              <label className="st-pp-field">
                <span>Z — depth</span>
                <span className="st-fr">
                  <input
                    type="range"
                    min={PROP_LIMITS.zMin}
                    max={PROP_LIMITS.zMax}
                    step={0.05}
                    value={sel.z}
                    onChange={(e) => update(selected, { z: Number(e.target.value) })}
                  />
                  <span className="st-val">{sel.z.toFixed(2)} m</span>
                </span>
              </label>
              <label className="st-pp-field">
                <span>Height</span>
                <span className="st-fr">
                  <input
                    type="range"
                    min={PROP_LIMITS.hMin}
                    max={PROP_LIMITS.hMax}
                    step={0.05}
                    value={sel.h}
                    onChange={(e) => update(selected, { h: Number(e.target.value) })}
                  />
                  <span className="st-val">{sel.h.toFixed(2)} m</span>
                </span>
              </label>
              <label className="st-pp-field">
                <span>Lift</span>
                <span className="st-fr">
                  <input
                    type="range"
                    min={PROP_LIMITS.eMin}
                    max={PROP_LIMITS.eMax}
                    step={0.05}
                    value={sel.e}
                    onChange={(e) => update(selected, { e: Number(e.target.value) })}
                  />
                  <span className="st-val">{sel.e.toFixed(2)} m</span>
                </span>
              </label>
              <button
                className={`st-ppb ${sel.f ? 'on' : ''}`}
                onClick={() => update(selected, { f: !sel.f })}
              >
                ⇄ FLIP
              </button>
              <button
                className="st-ppb"
                onClick={() => {
                  setLocal((list) => [...list, duplicateProp(sel)]);
                  setSelected(props.length);
                }}
              >
                ⧉ DUPLICATE
              </button>
              <button
                className="st-ppb"
                onClick={() => {
                  setLocal((list) => list.filter((_, i) => i !== selected));
                  setSelected(-1);
                }}
              >
                ✕ REMOVE
              </button>
            </>
          )}
        </div>

        <div className="st-modalfoot">
          <button className="st-btn ghost" onClick={() => setLocal([])}>
            CLEAR STAGE
          </button>
          <button className="st-btn paper" onClick={onClose}>
            CANCEL
          </button>
          <button className="st-btn green" onClick={save}>
            ✔ SAVE STAGE
          </button>
        </div>
        <div className="st-hintline" style={{ padding: '0 2px' }}>
          Uploads are compressed to WebP and stored in asset storage — not inside the story —
          capped at {formatBytes(2 * 1024 * 1024)} each. Animated GIFs can't be placed in a frame.
        </div>
      </div>
    </div>
  );
};
