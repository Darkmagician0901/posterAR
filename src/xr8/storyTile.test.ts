import { describe, it, expect } from 'vitest';
import { Group, Mesh, PlaneGeometry, Texture } from 'three';
import { StoryTile } from './storyTile';
import { POSTER_STANDS_UPRIGHT } from '@/xr/posterOrientation';
import { tileSize } from '@/xr/placement';

/** The tile's mesh, once setTexture has built it. */
const meshOf = (root: Group): Mesh => {
  const group = root.children[0] as Group;
  return group.children[0] as Mesh;
};

/** Width/height the tile's plane was actually built at. */
const planeOf = (mesh: Mesh) => {
  const p = mesh.geometry as PlaneGeometry;
  return { width: p.parameters.width, height: p.parameters.height };
};

describe('StoryTile sizing', () => {
  it('builds the plane at the human-scale size, not the old 0.9 m tile', () => {
    const root = new Group();
    const tile = new StoryTile(root);
    tile.setTexture(new Texture(), 0.5);

    const { width, height } = planeOf(meshOf(root));
    const expected = tileSize(0.5);
    expect(width).toBeCloseTo(expected.widthM);
    expect(height).toBeCloseTo(expected.heightM);
    expect(width).toBeGreaterThan(0.9);
  });

  it('resizes the plane when the era art changes shape', () => {
    const root = new Group();
    const tile = new StoryTile(root);
    tile.setTexture(new Texture(), 0.5);
    tile.setTexture(new Texture(), 2);

    const { width, height } = planeOf(meshOf(root));
    const expected = tileSize(2);
    expect(width).toBeCloseTo(expected.widthM);
    expect(height).toBeCloseTo(expected.heightM);
  });
});

describe('StoryTile grounding', () => {
  // composeUprightPosterMatrix centres the plane on the contact point, so half
  // the art is under the floor. At the old 0.9 m width that buried 0.23 m and
  // went unnoticed; at human scale it buries half a metre of the story.
  it('stands the art on the surface instead of half-sinking it', () => {
    const root = new Group();
    const tile = new StoryTile(root);
    tile.setTexture(new Texture(), 0.5);

    const mesh = meshOf(root);
    const { height } = planeOf(mesh);
    const bottomEdge = mesh.position.y - height / 2;

    if (POSTER_STANDS_UPRIGHT) {
      expect(bottomEdge).toBeCloseTo(0);
    } else {
      // Lying flat, the contact point is the middle of the art, not its edge.
      expect(mesh.position.y).toBe(0);
    }
  });

  it('keeps the art grounded after an era swap changes its height', () => {
    const root = new Group();
    const tile = new StoryTile(root);
    tile.setTexture(new Texture(), 0.5);
    tile.setTexture(new Texture(), 1.5);

    const mesh = meshOf(root);
    const { height } = planeOf(mesh);
    if (POSTER_STANDS_UPRIGHT) {
      expect(mesh.position.y - height / 2).toBeCloseTo(0);
    }
  });
});
