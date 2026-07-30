/**
 * gc-assets.ts — reclaim assets no published story references.
 *
 * Reachability is computed from the published documents themselves, which are
 * the source of truth for rendering (§4). Deriving it rather than maintaining
 * a counter means the answer cannot drift out of sync with what is actually
 * being served.
 *
 * This module is the reachability calculation ONLY — pure, unit-tested, and
 * deliberately without a caller. The S3 listing and deletion that would drive
 * it do not exist yet; nothing here deletes anything.
 *
 * The contract that shell must honour, recorded here because there is nowhere
 * else it could live:
 *
 * 1. Feed `published` every document under `stories/`, not a sample. An asset
 *    missing from the input is an asset this function reports as unreachable.
 * 2. Derive `stored` from the keys under `assets/`, mapping each back to its id
 *    with the one key builder in `src/story/assetStorage.ts` — never by
 *    re-splitting the path by hand.
 * 3. Delete BOTH keys an asset can occupy — `assetKey(assetId)` and, when the
 *    reference carries one, `assetKey(r1024Id)`. A derivative is an ordinary
 *    asset at its own address, so it appears in `stored` in its own right and
 *    comes back from this function in its own right; a shell that deletes only
 *    the ids it recognises as "parents" leaks every derivative forever.
 *    `unreachableAssets` protects a derivative for exactly as long as some
 *    document names it, because deleting one whose parent is still published
 *    costs every viewer of that story a 404 before the fallback.
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
      if (!isAssetRef(asset)) continue;
      reachable.add(asset.assetId);
      // The display derivative is a separate stored object under its own
      // content address, so it must be named here or GC would reclaim the
      // bytes every viewer of this story actually reads.
      if (asset.r1024Id !== undefined) reachable.add(asset.r1024Id);
    }
  }

  return stored.filter((id) => {
    if (reachable.has(id)) return false;
    return (createdAt.get(id) ?? 0) <= graceCutoff;
  });
}
