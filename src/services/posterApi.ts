import { API_BASE_URL } from '@/utils/constants'
import { getDeviceToken } from '@/utils/deviceToken'

export interface RemoteAsset {
  id: string
  url: string
  contentType: string
  isAnimated: boolean
  width: number
  height: number
  originalName: string | null
}

export function isPersistenceEnabled(): boolean {
  return API_BASE_URL !== ''
}

function authHeaders(): Record<string, string> {
  return { 'x-owner-id': getDeviceToken(), 'content-type': 'application/json' }
}

export interface PersistAssetInput {
  id: string
  blob: Blob
  contentType: string
  isAnimated: boolean
  width: number
  height: number
  originalName: string
}

export async function persistAsset(input: PersistAssetInput): Promise<RemoteAsset> {
  const res = await fetch(`${API_BASE_URL}/api/assets`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      id: input.id, contentType: input.contentType, isAnimated: input.isAnimated,
      width: input.width, height: input.height, byteSize: input.blob.size,
      originalName: input.originalName,
    }),
  })
  if (!res.ok) throw new Error(`persist metadata failed: ${res.status}`)
  const { uploadUrl, asset } = (await res.json()) as { uploadUrl: string; asset: RemoteAsset }

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': input.contentType },
    body: input.blob,
  })
  if (!put.ok) throw new Error(`upload bytes failed: ${put.status}`)
  return asset
}

export async function listAssets(): Promise<RemoteAsset[]> {
  const res = await fetch(`${API_BASE_URL}/api/assets`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`list assets failed: ${res.status}`)
  const { assets } = (await res.json()) as { assets: RemoteAsset[] }
  return assets
}
