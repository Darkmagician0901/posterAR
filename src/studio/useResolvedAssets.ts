/**
 * useResolvedAssets — resolved asset bytes for the studio's live preview.
 *
 * The document holds content addresses, but a preview has to show pixels. This
 * fetches them once per distinct asset (assetResolver caches, so revisiting a
 * frame is free) and hands back a map the compose adapter can use.
 *
 * Returns an empty map on the first render and while resolving. That is
 * deliberate: toComposeImages falls back to the `asset:` token, which renders
 * as a transparent gap rather than blocking the editor on a network round
 * trip.
 */

import { useEffect, useState } from 'react';
import { resolveAssets } from '@/story/assetResolver';
import type { StoryAsset } from '@/story/storyDoc';

export function useResolvedAssets(
  assets: Record<string, StoryAsset> | undefined,
): ReadonlyMap<string, string> {
  const [resolved, setResolved] = useState<ReadonlyMap<string, string>>(new Map());

  // Keyed on the asset identities rather than the object reference, so an
  // unrelated document edit does not re-trigger a fetch.
  const key = JSON.stringify(
    Object.entries(assets ?? {}).map(([alias, a]) => [alias, 'assetId' in a ? a.assetId : a.href]),
  );

  useEffect(() => {
    let cancelled = false;
    if (!assets || Object.keys(assets).length === 0) {
      setResolved(new Map());
      return;
    }
    void resolveAssets(assets).then((map) => {
      if (!cancelled) setResolved(map);
    });
    return () => {
      cancelled = true;
    };
    // `key` is the stable identity of `assets`; depending on the object
    // itself would refetch on every keystroke elsewhere in the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return resolved;
}
