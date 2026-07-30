/**
 * gc-assets.ts — reclaim assets no published story references.
 *
 * Reachability is computed from the published documents themselves, which are
 * the source of truth for rendering (§4). Deriving it rather than maintaining
 * a counter means the answer cannot drift out of sync with what is actually
 * being served.
 *
 * The reachability calculation is pure and unit-tested. The S3 listing and
 * deletion around it are not — they are a thin transport shell.
 */

import { isAssetRef, type StoryDoc } from '../src/story/storyDoc';

/**
 * Lists stored assets that are safe to delete.
 *
 * @param published — Every published document.
 * @param stored — Every stored assetId.
 * @param graceCutoff — Epoch ms; assets created after this are spared
 *   regardless of references. Uploads happen on drop, so an asset
 *   legitimately has no references between being added and the story being
 *   published — without this window, GC would delete work in progress.
 * @param createdAt — assetId to creation time in epoch ms. A missing entry is
 *   treated as old: an asset whose age cannot be established is not new, and
 *   the reference check still protects it.
 * @returns The assetIds to delete.
 */
export function unreachableAssets(
  published: StoryDoc[],
  stored: string[],
  graceCutoff: number,
  createdAt: ReadonlyMap<string, number> = new Map(),
): string[] {
  const reachable = new Set<string>();
  for (const doc of published) {
    for (const asset of Object.values(doc.assets ?? {})) {
      if (isAssetRef(asset)) reachable.add(asset.assetId);
    }
  }

  return stored.filter((id) => {
    if (reachable.has(id)) return false;
    return (createdAt.get(id) ?? 0) <= graceCutoff;
  });
}
