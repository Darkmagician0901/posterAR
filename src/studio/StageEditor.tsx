/**
 * StageEditor — the modal where a frame's art is staged.
 *
 * Two views of the same scene. The camera view shows exactly what the composer
 * will emit (it *is* the composed SVG), with invisible handles over each prop
 * for dragging left and right. The top-down map is the only place depth can be
 * set, because a vertical drag in the camera view is ambiguous between "further
 * away" and "lifted off the ground".
 *
 * Props come from the built-in library or from the author's own uploads, which
 * are compressed through the same path as poster uploads and stored as inline
 * data so composed art stays self-contained.
 *
 * Saving composes the props into the frame's `art`. Both are kept: `props` so
 * the frame stays re-editable, `art` because that is all the viewer reads.
 */

import React, { useMemo, useRef, useState } from 'react';
import { StoryProp } from '@/story/storyDoc';
import { PROP_LIBRARY } from '@/story/props/library';
import { composeFrame } from '@/story/props/compose';
import { composeFrameArt } from '@/story/props/frameArt';
import { validateAndProcessImage, formatBytes } from '@/utils/imageUpload';
import { useStudioDraft } from './studioDraftStore';
import { svgToDataUrl } from './svgPreview';
import { deriveBackdrop, parseSvgDoc, scaledBackdrop } from '@/story/props/backdrop';
import { PROP_LIMITS, duplicateProp } from './propEdit';
import { DEFAULT_MARKER } from '@/story/marker';
import { SCENE } from '@/story/projection';
import {
  markerFrontRect,
  markerTopRect,
  humanFrontRect,
  scaleBarFront,
  scaleBarTop,
  outOfRange,
} from './stageOverlay';
import {
  FRONT,
  TOP,
  depthScale,
  frontProject,
  frontUnprojectX,
  topProject,
  topUnproject,
  toViewBox,
} from './stageGeometry';

/** Where a newly added prop lands: mid-room, out from the wall. */
const DROP_IN = { x: 0, z: 2.3 };

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

  // Memoized because `?? {}` would mint a new object each render and defeat
  // the composition memo below — which re-serializes the whole scene.
  const images = useMemo(() => doc.assets ?? {}, [doc.assets]);

  // The poster every offset is measured from, and any prop that has drifted
  // outside the room it defines.
  const marker = doc.marker ?? DEFAULT_MARKER;
  const strayed = outOfRange(props);

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
        images,
        backdrop: scaledBackdrop(backdrop.inner, backdrop.width, backdrop.height, FRONT.w, FRONT.h),
      }),
    [props, images, backdrop],
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
      const id = addAsset({
        href: processed.dataUrl,
        aspect: processed.width / processed.height,
        name: processed.originalName,
      });
      // Size it so the image's real proportions read at a sensible scale.
      setLocal((list) => [...list, { t: 'img', k: id, ...DROP_IN, h: 1.8, f: false, e: 0 }]);
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
    // The backdrop is stored so a later re-edit reads it rather than re-deriving
    // it from this composed art (which already contains the props).
    patchFrame(frameIndex, {
      props,
      backdrop: backdropDoc,
      art: composeFrameArt({ ...frame, props }, images, backdropDoc),
    });
    onClose();
  };

  const sel = selected >= 0 ? props[selected] : undefined;
  const selName =
    sel === undefined
      ? ''
      : sel.t === 'lib'
        ? (PROP_LIBRARY[sel.k]?.name ?? sel.k)
        : (images[sel.k]?.name ?? 'UPLOAD');

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
                {(() => {
                  const m = markerFrontRect(marker);
                  const h = humanFrontRect();
                  const bar = scaleBarFront();
                  return (
                    <g className="st-ref" pointerEvents="none">
                      {/* The person and the bar are what make the poster's real
                          size read: on its own, true scale just looks like a dot. */}
                      <rect
                        x={h.x}
                        y={h.y}
                        width={h.w}
                        height={h.h}
                        rx={h.w / 2}
                        className="st-ref-human"
                      />
                      <line x1={bar.x1} y1={bar.y} x2={bar.x2} y2={bar.y} className="st-ref-bar" />
                      <text x={bar.x1} y={bar.y - 4} className="st-ref-lbl">
                        1 m
                      </text>
                      {marker.image === '' ? (
                        <rect x={m.x} y={m.y} width={m.w} height={m.h} className="st-ref-marker" />
                      ) : (
                        <image href={marker.image} x={m.x} y={m.y} width={m.w} height={m.h} />
                      )}
                      {/* True scale is honest but nearly invisible — an A3
                          poster is about four view units wide here, and it can
                          land on top of a prop. The ring and leader label are
                          fixed-size so it stays findable without being drawn
                          bigger than it is. */}
                      <rect
                        x={m.x - 3}
                        y={m.y - 3}
                        width={m.w + 6}
                        height={m.h + 6}
                        className="st-ref-ring"
                      />
                      <line
                        x1={m.x + m.w / 2}
                        y1={m.y - 4}
                        x2={m.x + m.w / 2}
                        y2={m.y - 16}
                        className="st-ref-lead"
                      />
                      <text
                        x={m.x + m.w / 2}
                        y={m.y - 20}
                        className="st-ref-lbl marker"
                        textAnchor="middle"
                      >
                        POSTER
                      </text>
                    </g>
                  );
                })()}
                {props.map((p, i) => {
                  const pt = frontProject(p.x, p.z, p.e);
                  const s = depthScale(p.z);
                  const hpx = p.h * FRONT.ppm * s;
                  const aspect =
                    p.t === 'img'
                      ? (images[p.k]?.aspect ?? 1)
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
                {/* The wall the poster hangs on, and the origin every depth is
                    measured from. */}
                <rect x="0" y="0" width={TOP.w} height="6" fill="#6a8a58" />
                <text x="6" y="20" fontSize="11" fill="#8fb27a">
                  WALL
                </text>
                {[1, 2, 3, 4].map((m) => {
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
                  fill="#e5761f"
                  stroke="#120e0e"
                  strokeWidth="2"
                />
                {(() => {
                  const m = markerTopRect(marker);
                  const bar = scaleBarTop();
                  return (
                    <g pointerEvents="none">
                      <rect x={m.x} y={m.y} width={m.w} height={m.h} fill="#e5761f" />
                      <line x1={bar.x1} y1={bar.y} x2={bar.x2} y2={bar.y} className="st-ref-bar" />
                      <text x={bar.x1} y={bar.y - 4} className="st-ref-lbl">
                        1 m
                      </text>
                    </g>
                  );
                })()}
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
              The orange arrow is the visitor. Drag a dot up to push that prop back toward the
              wall, down to bring it out into the room.
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
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => void onUpload(e.target.files?.[0])}
          />
        </div>

        {uploadError !== null && <div className="st-warn">{uploadError}</div>}

        {strayed.length > 0 && (
          <div className="st-warn">
            {`${strayed.length} prop${strayed.length === 1 ? ' sits' : 's sit'} outside the room — behind the wall, or further than ${SCENE.zMax} m out from it. Drag ${strayed.length === 1 ? 'it' : 'them'} back onto the map.`}
          </div>
        )}

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
          Uploads are compressed to WebP and stored inside the story, capped at{' '}
          {formatBytes(2 * 1024 * 1024)} each.
        </div>
      </div>
    </div>
  );
};
