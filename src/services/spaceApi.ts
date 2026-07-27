/**
 * spaceApi.ts — client for the marker-space persistence API.
 *
 * Mirrors posterApi.ts: same device-token auth header, same feature flag
 * (`VITE_API_BASE_URL` empty ⇒ persistence disabled and the app stays purely
 * in-memory), same thin fetch-and-throw error style.
 *
 * The split of responsibilities is worth stating, because it is the point of
 * the whole design: poster BYTES live in S3 via posterApi, while the tiny
 * marker-relative TRANSFORMS live in Postgres via this module. Recovering a
 * scene after a cold start means fetching these transforms and re-anchoring
 * them to a freshly detected marker — a few hundred bytes, not megabytes.
 */

import { API_BASE_URL } from '@/utils/constants';
import { getDeviceToken } from '@/utils/deviceToken';
import type { LocalTransform } from '@/xr/markerRelativeTransform';
import type { BoundAsset, Space } from '@/store/spaceStore';

/** True when a persistence backend is configured. */
export function isSpacePersistenceEnabled(): boolean {
  return API_BASE_URL !== '';
}

/**
 * Builds the auth + content headers for every request.
 *
 * @returns Headers carrying the per-device owner id.
 */
function authHeaders(): Record<string, string> {
  return { 'x-owner-id': getDeviceToken(), 'content-type': 'application/json' };
}

/** One binding as it travels over the wire. */
interface WireBinding {
  id: string;
  markerName: string;
  assetUrl: string;
  assetName: string;
  local: LocalTransform;
}

/**
 * Fetches every marker space belonging to this device.
 *
 * @returns Spaces keyed by marker, ready for `useSpaceStore.hydrate`.
 * @throws When the request fails; callers treat that as "start empty".
 */
export async function listSpaces(): Promise<Space[]> {
  const res = await fetch(`${API_BASE_URL}/api/spaces`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`list spaces failed: ${res.status}`);
  const { bindings } = (await res.json()) as { bindings: WireBinding[] };

  const byMarker = new Map<string, Space>();
  for (const b of bindings) {
    let space = byMarker.get(b.markerName);
    if (!space) {
      space = { markerName: b.markerName, assets: [] };
      byMarker.set(b.markerName, space);
    }
    const asset: BoundAsset = {
      id: b.id,
      assetUrl: b.assetUrl,
      assetName: b.assetName,
      local: b.local,
    };
    space.assets.push(asset);
  }
  return [...byMarker.values()];
}

/**
 * Creates or updates one binding (an upsert, so the slider can save
 * repeatedly without the client tracking whether the row exists yet).
 *
 * @param markerName — Image-target name the asset is anchored to.
 * @param asset — The binding to persist, including its marker-relative
 *   transform.
 * @throws When the request fails.
 */
export async function saveBinding(markerName: string, asset: BoundAsset): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/spaces/${encodeURIComponent(markerName)}/bindings/${asset.id}`,
    {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        assetUrl: asset.assetUrl,
        assetName: asset.assetName,
        local: asset.local,
      }),
    },
  );
  if (!res.ok) throw new Error(`save binding failed: ${res.status}`);
}

/**
 * Deletes one binding.
 *
 * @param markerName — Image-target name the asset was anchored to.
 * @param assetId — Binding id.
 * @throws When the request fails.
 */
export async function deleteBinding(markerName: string, assetId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/spaces/${encodeURIComponent(markerName)}/bindings/${assetId}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  if (!res.ok) throw new Error(`delete binding failed: ${res.status}`);
}
