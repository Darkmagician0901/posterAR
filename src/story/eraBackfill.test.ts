import { describe, it, expect } from 'vitest';
import { backfillEraProps, needsEraProps } from './eraBackfill';
import { eraProps } from './eraProps';
import { eraSvg } from './eraArt';
import { composeFrame } from './props/compose';
import { DEFAULT_STORY } from './defaultStory';
import type { StoryDoc, StoryFrame } from './storyDoc';

/** A saved era frame as it looked before frames carried props. */
function legacyFrame(key: 'wreck' | 'oil' | 'heal' | 'alive'): StoryFrame {
  return {
    key,
    year: '1951',
    label: 'WRECK',
    title: 'THE WRECKING YARD',
    line: 'narration the author rewrote',
    washColor: 'rgba(0,0,0,0)',
    art: eraSvg(key),
  };
}

function docOf(frames: StoryFrame[]): StoryDoc {
  return { ...DEFAULT_STORY, frames };
}

describe('needsEraProps', () => {
  it('accepts an untouched, unstaged era frame', () => {
    expect(needsEraProps(legacyFrame('wreck'))).toBe(true);
  });

  it('refuses a frame that already stages props', () => {
    const frame = { ...legacyFrame('oil'), props: eraProps('oil') };
    expect(needsEraProps(frame)).toBe(false);
  });

  it('refuses a frame whose art was customised', () => {
    const frame = { ...legacyFrame('heal'), art: '<svg>my own scene</svg>' };
    expect(needsEraProps(frame)).toBe(false);
  });

  it('refuses a frame carrying a frozen backdrop', () => {
    const frame = { ...legacyFrame('alive'), backdrop: '<svg>staged already</svg>' };
    expect(needsEraProps(frame)).toBe(false);
  });

  it('refuses a frame the author added themselves', () => {
    const frame = { ...legacyFrame('wreck'), key: 'frame-6-h9vvt' };
    expect(needsEraProps(frame)).toBe(false);
  });
});

describe('backfillEraProps', () => {
  it('stages an untouched era frame from that era’s props', () => {
    const out = backfillEraProps(docOf([legacyFrame('wreck')]));
    expect(out.frames[0].props).toEqual(eraProps('wreck'));
    expect(out.frames[0].art).toBe(composeFrame(eraProps('wreck')));
  });

  it('keeps every edit the author made to the frame', () => {
    const out = backfillEraProps(docOf([legacyFrame('oil')]));
    const f = out.frames[0];
    expect(f.line).toBe('narration the author rewrote');
    expect(f.title).toBe('THE WRECKING YARD');
    expect(f.year).toBe('1951');
    expect(f.key).toBe('oil');
  });

  it('leaves the author’s own staged frames untouched', () => {
    const mine: StoryFrame = {
      ...legacyFrame('wreck'),
      key: 'frame-6-h9vvt',
      art: '<svg>mine</svg>',
      backdrop: '<svg>mine</svg>',
      props: [{ t: 'lib', k: 'tree', x: 0, z: 1, h: 4.5, f: false, e: 0 }],
    };
    const out = backfillEraProps(docOf([legacyFrame('heal'), mine]));
    expect(out.frames[1]).toEqual(mine);
    expect(out.frames[0].props).toEqual(eraProps('heal'));
  });

  it('handles a draft missing an era, without inventing it', () => {
    // The author deleted the toxic frame; backfill must not resurrect it.
    const out = backfillEraProps(
      docOf([legacyFrame('wreck'), legacyFrame('oil'), legacyFrame('heal'), legacyFrame('alive')]),
    );
    expect(out.frames).toHaveLength(4);
    expect(out.frames.map((f) => f.key)).toEqual(['wreck', 'oil', 'heal', 'alive']);
    for (const f of out.frames) expect(f.props!.length).toBeGreaterThan(0);
  });

  it('returns the same object when nothing qualifies, so drafts are not churned', () => {
    const doc = docOf([{ ...legacyFrame('wreck'), art: '<svg>custom</svg>' }]);
    expect(backfillEraProps(doc)).toBe(doc);
  });

  it('is idempotent — running it twice changes nothing further', () => {
    const once = backfillEraProps(docOf([legacyFrame('alive')]));
    expect(backfillEraProps(once)).toBe(once);
  });

  it('leaves the already-propped bundled story alone', () => {
    expect(backfillEraProps(DEFAULT_STORY)).toBe(DEFAULT_STORY);
  });
});
