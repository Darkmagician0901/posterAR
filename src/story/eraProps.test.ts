import { describe, it, expect } from 'vitest';
import { ERA_PROPS, eraProps } from './eraProps';
import { PROP_LIBRARY } from './props/library';
import { STORY_ERAS } from './storyData';

describe('ERA_PROPS', () => {
  it('covers every shipped era', () => {
    expect(Object.keys(ERA_PROPS).sort()).toEqual(STORY_ERAS.map((e) => e.key).sort());
  });

  it('stages at least one prop per era, so no frame opens empty', () => {
    for (const era of STORY_ERAS) {
      expect(ERA_PROPS[era.key].length).toBeGreaterThan(0);
    }
  });

  it('uses only keys the library can actually draw', () => {
    // composeFrame silently drops unknown keys, so a typo here would show up as
    // a missing object rather than an error.
    for (const era of STORY_ERAS) {
      for (const p of ERA_PROPS[era.key]) {
        expect(PROP_LIBRARY[p.k], `${era.key}: unknown prop key "${p.k}"`).toBeDefined();
      }
    }
  });

  it('gives every prop a positive height and a non-negative depth', () => {
    for (const era of STORY_ERAS) {
      for (const p of ERA_PROPS[era.key]) {
        expect(p.h).toBeGreaterThan(0);
        expect(p.z).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('marks every prop as a library prop', () => {
    for (const era of STORY_ERAS) {
      for (const p of ERA_PROPS[era.key]) expect(p.t).toBe('lib');
    }
  });

  it('carries the prototype template for the wrecking yard verbatim', () => {
    // docs/prototypes/arcade-studio-v4.html:772
    expect(ERA_PROPS.wreck).toEqual([
      { t: 'lib', k: 'car', x: -0.9, z: 1.3, h: 1.35, f: false, e: 0 },
      { t: 'lib', k: 'car', x: 1.0, z: 2.2, h: 1.35, f: true, e: 0 },
      { t: 'lib', k: 'tirestack', x: 1.9, z: 0.9, h: 0.8, f: false, e: 0 },
      { t: 'lib', k: 'sign', x: -2.0, z: 0.8, h: 2.0, f: false, e: 0 },
    ]);
  });

  it('keeps the toxic frame’s lifted fume above the ground', () => {
    const fume = ERA_PROPS.toxic.find((p) => p.k === 'fume');
    expect(fume?.e).toBe(0.35);
  });
});

describe('eraProps', () => {
  it('returns a copy the caller can mutate without corrupting the table', () => {
    const first = eraProps('wreck');
    first[0].x = 99;
    expect(eraProps('wreck')[0].x).toBe(-0.9);
    expect(ERA_PROPS.wreck[0].x).toBe(-0.9);
  });
});
