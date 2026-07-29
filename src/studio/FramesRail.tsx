/**
 * FramesRail — the left rail listing every frame in the story.
 *
 * Each card shows the frame's composed art as a thumbnail plus its year and
 * title, and carries inline controls to reorder or delete. Cards are drag-
 * reorderable using the native HTML drag events, matching the prototype.
 */

import React, { useState } from 'react';
import { StoryFrame } from '@/story/storyDoc';
import { useStudioDraft } from './studioDraftStore';
import { svgToDataUrl } from './svgPreview';

/** One card in the rail. */
const FrameCard: React.FC<{
  frame: StoryFrame;
  index: number;
  selected: boolean;
  isDragTarget: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}> = ({
  frame,
  index,
  selected,
  isDragTarget,
  canDelete,
  onSelect,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}) => (
  <div
    className={`st-fcard ${selected ? 'sel' : ''} ${isDragTarget ? 'dragover' : ''}`}
    draggable
    onDragStart={onDragStart}
    onDragOver={onDragOver}
    onDrop={onDrop}
    onDragEnd={onDragEnd}
  >
    <span className="st-fnum">{index + 1}</span>
    <button
      type="button"
      onClick={onSelect}
      style={{
        all: 'unset',
        display: 'block',
        width: '100%',
        cursor: 'pointer',
      }}
      aria-current={selected}
      aria-label={`Edit frame ${index + 1}: ${frame.title}`}
    >
      <div className="st-fthumb">
        <img src={svgToDataUrl(frame.art)} alt="" />
      </div>
      <div className="st-fy">{frame.year}</div>
      <div className="st-ft">{frame.title}</div>
    </button>
    <div className="st-fops">
      <button className="st-fop" onClick={onMoveUp} disabled={index === 0} title="Move up">
        ↑
      </button>
      <button className="st-fop" onClick={onMoveDown} title="Move down">
        ↓
      </button>
      <button
        className="st-fop"
        onClick={onDelete}
        disabled={!canDelete}
        title={canDelete ? 'Delete frame' : 'A story needs at least one frame'}
      >
        ✕
      </button>
    </div>
  </div>
);

export const FramesRail: React.FC = () => {
  const doc = useStudioDraft((s) => s.doc);
  const selected = useStudioDraft((s) => s.selected);
  const { select, addFrame, removeFrame, moveFrame } = useStudioDraft.getState();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const frames = doc.frames;

  return (
    <div className="st-rail">
      <div className="st-rail-head">
        FRAMES <span>drag to reorder</span>
      </div>

      <div className="st-frames">
        {frames.map((frame, i) => (
          <FrameCard
            key={frame.key}
            frame={frame}
            index={i}
            selected={i === selected}
            isDragTarget={dragOver === i && dragFrom !== i}
            canDelete={frames.length > 1}
            onSelect={() => select(i)}
            onDelete={() => removeFrame(i)}
            onMoveUp={() => moveFrame(i, i - 1)}
            onMoveDown={() => moveFrame(i, Math.min(i + 1, frames.length - 1))}
            onDragStart={() => setDragFrom(i)}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(i);
            }}
            onDrop={() => {
              if (dragFrom !== null) moveFrame(dragFrom, i);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
          />
        ))}
      </div>

      <button className="st-addframe" onClick={addFrame}>
        + ADD FRAME
      </button>
    </div>
  );
};
